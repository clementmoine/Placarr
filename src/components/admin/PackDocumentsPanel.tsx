"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ExternalLink, FileText } from "lucide-react";

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
  thumbRelativePath?: string | null;
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

function documentFileUrl(packId: string, relativePath: string): string {
  return `/api/admin/pack-documents/file?pack=${encodeURIComponent(packId)}&path=${encodeURIComponent(relativePath)}`;
}

function documentThumbSrc(doc: PackDocumentRow): string | null {
  if (doc.thumbRelativePath) {
    return documentFileUrl(doc.packId, doc.thumbRelativePath);
  }
  if (!doc.relativePath) return null;
  // Lazy generate + redirect to sibling webp.
  return `/api/admin/pack-documents/thumb?pack=${encodeURIComponent(doc.packId)}&path=${encodeURIComponent(doc.relativePath)}`;
}

function DocumentCardArt({
  doc,
  fr,
}: {
  doc: PackDocumentRow;
  fr: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = documentThumbSrc(doc);

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted/40">
      {!src || failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
          <FileText className="size-8 text-muted-foreground/70" aria-hidden />
          <span className="text-[10px] font-medium text-muted-foreground">
            {doc.relativePath
              ? fr
                ? "aperçu indisponible"
                : "no preview"
              : fr
                ? "URL seule"
                : "URL only"}
          </span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain object-top"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
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
        <p className="text-xs text-muted-foreground tabular-nums">
          {fr
            ? `${(data?.documents.length ?? 0).toLocaleString("fr-FR")} documents`
            : `${(data?.documents.length ?? 0).toLocaleString("en-GB")} documents`}
        </p>
        {isFetching ? (
          <span className="text-xs text-muted-foreground">…</span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-md" />
          ))}
        </div>
      ) : (data?.documents.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fr
            ? "Aucun document pour ce pack. Densifier via Catalogue Sync (étape documents)."
            : "No documents for this pack. Densify via Catalogue Sync (documents step)."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {data!.documents.map((doc) => {
            const langLabel = printLanguageLabel(doc.lang);
            const openHref = doc.relativePath
              ? documentFileUrl(doc.packId, doc.relativePath)
              : doc.sourceUrl;
            return (
              <figure
                key={`${doc.packId}:${doc.id}`}
                className="flex flex-col gap-1"
              >
                <a
                  href={openHref}
                  target="_blank"
                  rel="noreferrer"
                  className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={doc.title}
                >
                  <DocumentCardArt doc={doc} fr={fr} />
                </a>
                <figcaption className="space-y-0.5 px-0.5">
                  <div className="line-clamp-2 text-xs font-medium leading-snug">
                    {doc.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <span>
                      {langLabel.flag ? `${langLabel.flag} ` : ""}
                      {langLabel.name}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{kindLabel(doc.kind, fr)}</span>
                    {doc.bytes != null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{formatBytes(doc.bytes, fr)}</span>
                      </>
                    ) : (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        {fr ? "URL" : "URL"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 pt-0.5">
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[10px]">
                      <a href={openHref} target="_blank" rel="noreferrer">
                        {fr ? "Ouvrir" : "Open"}
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="h-7 w-7 px-0">
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
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
