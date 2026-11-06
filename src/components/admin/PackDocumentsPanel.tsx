"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PACK_DOCUMENT_KINDS,
  type PackDocumentKind,
} from "@/lib/shared/packDocumentKinds";
import { printLanguageLabel } from "@/lib/shared/printLanguages";

type PackDocumentRow = {
  packId: string;
  id: string;
  title: string;
  lang: string;
  kind: PackDocumentKind;
  sourceUrl: string;
  fetchedAt: string | null;
  relativePath: string | null;
  sha256: string | null;
  bytes: number | null;
};

type PackDocumentsResponse = {
  documents: PackDocumentRow[];
  packs: string[];
  kinds: readonly PackDocumentKind[];
  /** Unfiltered pack locales — keep the lang Select stable under filtering. */
  availableLocales?: string[];
};

function DocLangCell({ code }: { code: string }) {
  const label = printLanguageLabel(code);
  return (
    <span title={label.name}>
      {label.flag ? `${label.flag} ` : ""}
      {label.name}
    </span>
  );
}

function formatBytes(n: number | null, fr: boolean): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} ${fr ? "o" : "B"}`;
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} ${fr ? "Ko" : "KB"}`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} ${fr ? "Mo" : "MB"}`;
}

const KIND_LABELS: Record<
  PackDocumentKind,
  { fr: string; en: string }
> = {
  rulebook: { fr: "Règles", en: "Rulebook" },
  set_notes: { fr: "Notes de set", en: "Set notes" },
  checklist: { fr: "Checklist", en: "Checklist" },
  op: { fr: "Organisé / OP", en: "Organized play" },
  penalty: { fr: "Pénalités", en: "Penalties" },
  brand: { fr: "Portail marque", en: "Brand portal" },
  other: { fr: "Autre", en: "Other" },
};

function kindLabel(kind: string, fr: boolean): string {
  const entry = KIND_LABELS[kind as PackDocumentKind];
  if (!entry) return kind;
  return fr ? entry.fr : entry.en;
}

/**
 * Catalogue browse scope — same surface as Cartes / Scellés / Rendu.
 * `packId` locks the list to the active catalogue line.
 */
export function PackDocumentsPanel({
  packId,
  locale,
}: {
  packId: string;
  locale: string;
}) {
  const fr = locale === "fr";
  const [lang, setLang] = useState("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-pack-documents", packId, lang, kind, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("pack", packId);
      if (lang !== "all") params.set("lang", lang);
      if (kind !== "all") params.set("kind", kind);
      if (q.trim()) params.set("q", q.trim());
      const { data: body } = await axios.get<PackDocumentsResponse>(
        `/api/admin/pack-documents?${params.toString()}`,
      );
      return body;
    },
    placeholderData: keepPreviousData,
  });

  const langs = useMemo(() => {
    if (data?.availableLocales?.length) {
      return [...data.availableLocales].sort((a, b) => a.localeCompare(b));
    }
    // Fallback while older responses / first paint have no availableLocales.
    const set = new Set<string>();
    for (const doc of data?.documents ?? []) set.add(doc.lang);
    if (lang !== "all") set.add(lang);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data?.availableLocales, data?.documents, lang]);

  const kinds = data?.kinds?.length ? data.kinds : PACK_DOCUMENT_KINDS;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger
            className="h-8 w-[11rem] text-xs"
            aria-label={fr ? "Langue du catalogue" : "Catalogue language"}
          >
            <SelectValue placeholder={fr ? "Langue" : "Language"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {fr ? "Toutes locales" : "All locales"}
            </SelectItem>
            {langs.map((code) => {
              const label = printLanguageLabel(code);
              return (
                <SelectItem key={code} value={code}>
                  {label.flag ? `${label.flag} ` : ""}
                  {label.name}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger
            className="w-[180px]"
            aria-label={fr ? "Type" : "Type"}
          >
            <SelectValue placeholder={fr ? "Type" : "Type"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {fr ? "Tous les types" : "All types"}
            </SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {kindLabel(k, fr)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={fr ? "Filtrer…" : "Filter…"}
          aria-label={fr ? "Filtrer les documents" : "Filter documents"}
        />
        {isFetching ? (
          <span className="text-xs text-muted-foreground">…</span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (data?.documents.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fr
            ? "Aucun document pour ce pack. Densifier via Catalogue Sync (étape documents)."
            : "No documents for this pack. Densify via Catalogue Sync (documents step)."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">
                  {fr ? "Titre" : "Title"}
                </th>
                <th className="px-3 py-2 font-medium">
                  {fr ? "Langue" : "Language"}
                </th>
                <th className="px-3 py-2 font-medium">
                  {fr ? "Type" : "Type"}
                </th>
                <th className="px-3 py-2 font-medium">
                  {fr ? "Taille" : "Size"}
                </th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">
                    {fr ? "Actions" : "Actions"}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data!.documents.map((doc) => (
                <tr key={`${doc.packId}:${doc.id}`} className="border-t">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{doc.title}</div>
                    {doc.relativePath ? (
                      <div className="text-xs text-muted-foreground">
                        {doc.relativePath}
                      </div>
                    ) : (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {fr ? "URL seule" : "URL only"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <DocLangCell code={doc.lang} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {kindLabel(doc.kind, fr)}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    {formatBytes(doc.bytes, fr)}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      {doc.relativePath ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={`/api/admin/pack-documents/file?pack=${encodeURIComponent(doc.packId)}&path=${encodeURIComponent(doc.relativePath)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {fr ? "Ouvrir" : "Open"}
                          </a>
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={doc.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={
                            fr
                              ? `Source : ${doc.sourceUrl}`
                              : `Source: ${doc.sourceUrl}`
                          }
                          aria-label={
                            fr ? "Ouvrir la source" : "Open source"
                          }
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
