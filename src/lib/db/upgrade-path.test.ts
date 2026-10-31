import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './database';

/*
 * A browser that last opened the app months ago holds an old version of the
 * database, and opening today's app runs every upgrade since then in order.
 * Desktop browsers used daily never walk that path, so a mistake in an old
 * upgrade only shows on a device that has been away — a phone, 2026-11-01,
 * "Table stock_consumptions not part of transaction". This opens a database
 * at every earlier version and upgrades it to the current one.
 */

const NAME = 'realestate_platform';

interface VersionLike {
  _cfg: { version: number; storesSource: Record<string, string | null> };
}

function versionsOf(db: Dexie): VersionLike[] {
  return (db as unknown as { _versions: VersionLike[] })._versions.slice().sort((a, b) => a._cfg.version - b._cfg.version);
}

const all = versionsOf(new AppDatabase());
const latest = all[all.length - 1]._cfg.version;

afterEach(async () => {
  await Dexie.delete(NAME);
});

describe('database upgrade path', () => {
  it.each(all.slice(0, -1).map((v) => v._cfg.version))('upgrades a v%i database to the latest version', async (from) => {
    // the app as it was at `from`: the same version blocks, without upgrade functions
    const old = new Dexie(NAME);
    for (const v of all.filter((x) => x._cfg.version <= from)) old.version(v._cfg.version).stores(v._cfg.storesSource);
    await old.open();
    old.close();

    const current = new AppDatabase();
    await expect(current.open()).resolves.toBeDefined();
    expect(current.verno).toBe(latest);
    current.close();
  });

  it('still builds the material catalogue when a v12 database holding stock upgrades', async () => {
    const old = new Dexie(NAME);
    for (const v of all.filter((x) => x._cfg.version <= 12)) old.version(v._cfg.version).stores(v._cfg.storesSource);
    await old.open();
    await old.table('stock').add({ id: 's1', project_id: 'p1', item_name: 'Cement', unit: 'bag', quantity: 10 });
    old.close();

    const current = new AppDatabase();
    await current.open();
    const items = await current.table('material_items').toArray();
    expect(items.map((i) => i.name)).toEqual(['Cement']);
    expect((await current.table('stock').get('s1'))?.item_id).toBe(items[0].id);
    current.close();
  });
});
