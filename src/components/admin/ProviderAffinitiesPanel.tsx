"use client";

import { useQuery } from "@tanstack/react-query";
import { Brain } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

type AffinityRow = {
  scopeKey: string;
  capability: string;
  providerId: string;
  successCount: number;
  confidence: number;
  lastAt: string;
};

async function fetchAffinities(): Promise<AffinityRow[]> {
  const res = await fetch("/api/admin/provider-affinities", {
    headers: { Accept: "application/json" },
  });
  const body = (await res.json()) as {
    ok?: boolean;
    affinities?: AffinityRow[];
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body.affinities ?? [];
}

/** Plex-like “what works” memory — providers consumed per catalogue scope. */
export function ProviderAffinitiesPanel() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const query = useQuery({
    queryKey: ["providerAffinities"],
    queryFn: fetchAffinities,
    staleTime: 30_000,
  });

  const rows = query.data ?? [];

  return (
    <Card className="border bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          {fr ? "Affinités providers" : "Provider affinities"}
        </CardTitle>
        <CardDescription>
          {fr
            ? "Succès mémorisés au scope catalogue (preuve / ordre d’appel soft — le consensus reste multi-source)."
            : "Catalogue-scoped wins (proof / soft call order — consensus stays multi-source)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-xs text-muted-foreground">
            {fr ? "Chargement…" : "Loading…"}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {fr
              ? "Aucune affinité encore — les succès prix/cover s’enregistrent au fil des refresh."
              : "No affinities yet — price/cover wins record as refreshes succeed."}
          </p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="p-2 font-medium">Scope</th>
                  <th className="p-2 font-medium">Cap</th>
                  <th className="p-2 font-medium">Provider</th>
                  <th className="p-2 font-medium text-right">N</th>
                  <th className="p-2 font-medium">Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.scopeKey}|${row.capability}|${row.providerId}`}
                    className="border-t"
                  >
                    <td className="p-2 font-mono">{row.scopeKey}</td>
                    <td className="p-2">{row.capability}</td>
                    <td className="p-2 font-mono">{row.providerId}</td>
                    <td className="p-2 text-right">{row.successCount}</td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(row.lastAt).toLocaleString(
                        fr ? "fr-FR" : "en-GB",
                      )}
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
