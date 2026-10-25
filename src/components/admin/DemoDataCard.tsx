"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Database, Eraser, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMockSession } from "@/lib/auth/mock-session";
import {
  clearDemoData,
  resetBasicData,
  resetDemoData,
} from "@/lib/db/demo-seed";
import { seedIfEmpty } from "@/lib/db/seed";
import { landRepository } from "@/lib/repositories";

/**
 * Lets the demo be reset or emptied on purpose. Sample data loads itself on a
 * fresh database; clearing it here also stops it coming back on reload.
 */
export function DemoDataCard() {
  const { userId } = useMockSession();
  const [action, setAction] = useState<"reset" | "basic" | "clear" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const landCount = useLiveQuery(() => landRepository.count(), []);

  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      /*
       * The app seeds itself on start. If a reload begins while that is still
       * running, the reload empties the tables, start-up sees an empty
       * database and seeds too, and the two collide on unique phone numbers
       * (found 2026-10-21). Wait for start-up first; it is single-flight.
       */
      await seedIfEmpty();
      if (action === "reset") await resetDemoData(userId);
      if (action === "basic") await resetBasicData(userId);
      if (action === "clear") await clearDemoData();
      setAction(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The sample data could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader title="Demo data" />
        <p className="text-sm text-ink-muted">
          {landCount === 0
            ? "All records have been cleared. Reload the sample dataset to explore the modules with realistic records."
            : "This install is preloaded with sample Bangladeshi records — every pipeline status, both acquisition types, towers with generated units, bookings with kisti and full-payment agreements (some buyers behind), and a construction log with towers running ahead of and behind plan."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAction("reset")}
          >
            <RefreshCw className="size-4" /> Reload sample data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAction("basic")}
          >
            <Eraser className="size-4" /> Clean start (basic data only)
          </Button>
          {landCount !== 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAction("clear")}
            >
              <Trash2 className="size-4" /> Clear all records
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={action !== null}
        icon={Database}
        tone={action === "clear" ? "danger" : "warning"}
        title={
          action === "clear"
            ? "Clear all records"
            : action === "basic"
              ? "Clean start"
              : "Reload sample data"
        }
        subtitle="Modules 1–5 — Land, Projects, Leads, Bookings and Site Progress"
        message={
          action === "basic"
            ? "Everything is deleted, then only the basic data is loaded back: staff accounts and the supplier list, plus master data and company settings. No projects, land, bank accounts, partners or money — you enter those yourself."
            : action === "clear"
              ? "Every land, landowner, JV term, pipeline entry and uploaded document will be deleted from this browser. Master data and company settings stay."
              : "This deletes the current land records and loads the sample dataset again. Anything you added yourself will be lost."
        }
        confirmLabel={
          action === "clear"
            ? "Clear everything"
            : action === "basic"
              ? "Start clean"
              : "Reload sample data"
        }
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={run}
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
