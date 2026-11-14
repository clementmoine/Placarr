"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

type PromoteRow = {
  id: string;
  itemId: string;
  dataPack: string | null;
  printKey: string | null;
  barcode: string | null;
  title: string | null;
  status: string;
  note: string | null;
  createdAt: string;
};

async function fetchPending(): Promise<PromoteRow[]> {
  const res = await fetch("/api/admin/corpus-promote?status=pending", {
    headers: { Accept: "application/json" },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    candidates?: PromoteRow[];
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body.candidates ?? [];
}

async function enqueueItem(itemId: string): Promise<void> {
  const res = await fetch("/api/admin/corpus-promote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ itemId }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

async function setStatus(
  id: string,
  status: "accepted" | "rejected",
): Promise<{ appliedToCorpus: boolean; reason?: string; status: string }> {
  const res = await fetch("/api/admin/corpus-promote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ id, status }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    appliedToCorpus?: boolean;
    reason?: string;
    status?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return {
    appliedToCorpus: Boolean(body.appliedToCorpus),
    reason: body.reason,
    status: body.status || status,
  };
}

/** Admin-confirm queue: accept writes LocalPrintsIndex when the pack supports it. */
export function CorpusPromotePanel() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["corpusPromotePending"],
    queryFn: fetchPending,
    staleTime: 15_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["corpusPromotePending"] });
  }, [queryClient]);

  const onEnqueue = useCallback(async () => {
    const id = itemId.trim();
    if (!id) return;
    setBusy("enqueue");
    try {
      await enqueueItem(id);
      toast.success(fr ? "Candidat en file" : "Candidate queued");
      setItemId("");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [fr, itemId, refresh]);

  const onDecide = useCallback(
    async (id: string, status: "accepted" | "rejected") => {
      setBusy(id);
      try {
        const result = await setStatus(id, status);
        if (status === "rejected") {
          toast.success(fr ? "Rejeté" : "Rejected");
        } else if (result.appliedToCorpus) {
          toast.success(
            fr ? "Accepté et écrit dans le corpus" : "Accepted and written to corpus",
          );
        } else {
          toast.message(
            fr
              ? `Accepté — corpus non écrit${result.reason ? ` (${result.reason})` : ""}`
              : `Accepted — corpus not written${result.reason ? ` (${result.reason})` : ""}`,
          );
        }
        refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    },
    [fr, refresh],
  );

  const rows = query.data ?? [];

  return (
    <Card className="border bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowUpFromLine className="size-4 text-primary" />
          {fr ? "Promote shelf → corpus" : "Promote shelf → corpus"}
        </CardTitle>
        <CardDescription>
          {fr
            ? "File de confirmation admin — l’acceptation écrit le tirage dans le LocalPrintsIndex du pack (quand le hook existe)."
            : "Admin-confirm queue — accept writes the print into the pack LocalPrintsIndex when the hook exists."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder={fr ? "itemId (barcode ou printKey requis)" : "itemId (barcode or printKey required)"}
            className="max-w-md font-mono text-sm"
          />
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || !itemId.trim()}
            onClick={() => void onEnqueue()}
          >
            {fr ? "Proposer" : "Enqueue"}
          </Button>
        </div>

        {query.isLoading ? (
          <p className="text-xs text-muted-foreground">
            {fr ? "Chargement…" : "Loading…"}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {fr ? "Aucun candidat en attente." : "No pending candidates."}
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="p-2 font-medium">Title</th>
                  <th className="p-2 font-medium">Pack</th>
                  <th className="p-2 font-medium">Identity</th>
                  <th className="p-2 font-medium text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{row.title || "—"}</div>
                      <div className="font-mono text-muted-foreground">
                        {row.itemId}
                      </div>
                    </td>
                    <td className="p-2 font-mono">{row.dataPack || "—"}</td>
                    <td className="p-2 font-mono">
                      {row.printKey || row.barcode || "—"}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mr-1"
                        disabled={busy !== null}
                        onClick={() => void onDecide(row.id, "accepted")}
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void onDecide(row.id, "rejected")}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
