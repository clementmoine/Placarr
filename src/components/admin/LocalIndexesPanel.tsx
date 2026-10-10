"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CATALOG_INDEX_SYNC_KINDS,
  enqueueCatalogIndexSync,
  type CatalogIndexSyncKind,
} from "@/lib/client/catalogIndexSync";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

const TARGETS: {
  kind: CatalogIndexSyncKind;
  labelFr: string;
  labelEn: string;
  blurbFr: string;
  blurbEn: string;
}[] = [
  {
    kind: CATALOG_INDEX_SYNC_KINDS[0],
    labelFr: "iCollect catalog",
    labelEn: "iCollect catalog",
    blurbFr: "Tick catalogue / pages (skip déjà frais).",
    blurbEn: "Catalog / page tick (skips fresh rows).",
  },
  {
    kind: CATALOG_INDEX_SYNC_KINDS[1],
    labelFr: "LaunchBox Metadata",
    labelEn: "LaunchBox Metadata",
    blurbFr: "Rebuild index Metadata.zip → SQLite.",
    blurbEn: "Rebuild Metadata.zip → SQLite index.",
  },
  {
    kind: CATALOG_INDEX_SYNC_KINDS[2],
    labelFr: "No-Intro DAT",
    labelEn: "No-Intro DAT",
    blurbFr: "Sync pack DAT si besoin, puis SQLite.",
    blurbEn: "Sync DAT pack if needed, then SQLite.",
  },
];

export function LocalIndexesPanel() {
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const fr = locale === "fr";
  const [busy, setBusy] = useState<CatalogIndexSyncKind | null>(null);

  const run = async (kind: CatalogIndexSyncKind) => {
    setBusy(kind);
    try {
      const done = await enqueueCatalogIndexSync(kind);
      toast.success(done.hint ?? done.label);
      void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="size-4 text-primary" />
          {fr ? "Index locaux" : "Local indexes"}
        </CardTitle>
        <CardDescription>
          {fr
            ? "Même famille que foil extract : file catalog worker, visible dans le menu d’activité."
            : "Same family as foil extract: catalog worker queue, visible in the activity menu."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {TARGETS.map((row) => (
          <div
            key={row.kind}
            className="flex flex-col gap-2 rounded-md border bg-background/50 p-3"
          >
            <div className="text-sm font-medium">
              {fr ? row.labelFr : row.labelEn}
            </div>
            <p className="text-xs text-muted-foreground flex-1">
              {fr ? row.blurbFr : row.blurbEn}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run(row.kind)}
            >
              <RefreshCw
                className={`size-3.5 ${busy === row.kind ? "animate-spin" : ""}`}
              />
              {fr ? "Mettre à jour" : "Update"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
