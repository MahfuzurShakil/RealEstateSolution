'use client';

/**
 * Builds the material catalogue out of the item names already stored, then
 * points every existing row at its item (Tier 3.1).
 *
 * Done as a back-fill rather than left to the "progressive matching" §3.1
 * proposed, because a half-migrated table is the worst of both:
 * `stockRepository.findRow` would key on the item for some rows and on the
 * spelling for others *forever*, and the two spellings this feature exists to
 * merge would go on holding separate stock and separate weighted averages in
 * the meantime. One pass settles it.
 *
 * The pass is additive — it inserts catalogue rows and fills a nullable column,
 * and touches no quantity and no price. If it failed part-way, the rows it did
 * not reach would keep working through the name fallback that deliberately
 * stays in `findRow`.
 *
 * **It runs from two places, which is why it lives here rather than inside the
 * version block.** Dexie's `.upgrade()` fires only when an existing database
 * moves from v12 to v13; a database created fresh at v13 skips it entirely, so
 * a new install seeded with demo data would otherwise end up with procurement
 * rows and an empty catalogue. The demo seed calls the same function once its
 * procurement data exists.
 */

/** Both a Dexie instance and an upgrade transaction expose `table(name)`. */
interface TableScope {
  table(name: string): {
    toArray(): Promise<Record<string, unknown>[]>;
    add(row: Record<string, unknown>): Promise<unknown>;
    update(key: string, changes: Record<string, unknown>): Promise<unknown>;
  };
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function backfillMaterialItems(scope: TableScope): Promise<number> {
  const items = scope.table('material_items');
  const existing = await items.toArray();

  /*
   * `(name, unit)` is the seed key. A name stocked in two units was two stock
   * rows before this and becomes two catalogue items, which is the honest
   * reading of what was recorded — merging them is a decision about combining
   * two weighted averages, and a migration is the wrong place to make it.
   */
  const keyOf = (name: string, unit: string) => `${name.toLowerCase()}|${unit.toLowerCase()}`;
  const seen = new Map<string, string>();
  for (const row of existing) {
    seen.set(keyOf(asText(row.name), asText(row.unit)), String(row.id));
  }
  let sequence = existing.length;
  let created = 0;

  const now = new Date().toISOString();
  const ensure = async (rawName: unknown, rawUnit: unknown): Promise<string | null> => {
    const name = asText(rawName);
    const unit = asText(rawUnit);
    if (!name) return null;

    const key = keyOf(name, unit);
    const known = seen.get(key);
    if (known) return known;

    sequence += 1;
    created += 1;
    const id = crypto.randomUUID();
    await items.add({
      id,
      code: `ITM-${String(sequence).padStart(4, '0')}`,
      name,
      unit: unit || 'piece',
      category: null,
      is_active: true,
      notes: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    });
    seen.set(key, id);
    return id;
  };

  /*
   * `stock` first, so the catalogue is seeded from the rows that actually hold
   * quantity and cost. Everything else then matches into those items rather
   * than creating near-duplicates in whatever order the tables happen to be
   * read in.
   */
  for (const name of ['stock', 'stock_issues', 'stock_transfers', 'purchase_order_items']) {
    const table = scope.table(name);
    for (const row of await table.toArray()) {
      if (row.item_id) continue;
      const id = await ensure(row.item_name, row.unit);
      if (id) await table.update(String(row.id), { item_id: id });
    }
  }

  /*
   * Requisitions link but never *create* an item. A request is a wish: a line
   * somebody typed and nobody ever ordered is not evidence that the material
   * exists, and letting it into the catalogue would fill the picker with
   * things that were never bought.
   */
  const requests = scope.table('material_request_items');
  for (const row of await requests.toArray()) {
    if (row.item_id) continue;
    const id = seen.get(keyOf(asText(row.item_name), asText(row.unit)));
    if (id) await requests.update(String(row.id), { item_id: id });
  }

  return created;
}
