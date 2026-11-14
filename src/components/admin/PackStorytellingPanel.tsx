"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StoryBodyWithMentions } from "@/components/storytelling/StoryBodyWithMentions";

type PackStorySource = { claim: string; url: string };

type PackStoryRow = {
  packId: string;
  id: string;
  status: "editorial" | "draft";
  bodyFr: string;
  plainText: string;
  targets: { sealed: readonly string[]; prints: readonly string[] };
  sources: readonly PackStorySource[];
};

type PackStoriesResponse = {
  pack: string;
  stories: PackStoryRow[];
};

/**
 * Admin catalogue desk — editorial « Le saviez-vous ? » + dig sources.
 */
export function PackStorytellingPanel({
  packId,
  locale,
}: {
  packId: string;
  locale: string;
}) {
  const fr = locale === "fr";
  const [q, setQ] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["pack-stories", packId, q],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data: body } = await axios.get<PackStoriesResponse>(
        "/api/admin/pack-stories",
        { params: { pack: packId, ...(q.trim() ? { q: q.trim() } : {}) } },
      );
      return body;
    },
  });

  const stories = data?.stories ?? [];
  const editorialCount = useMemo(
    () => stories.filter((s) => s.status === "editorial").length,
    [stories],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            fr
              ? "Rechercher une chronique, un SKU, une source…"
              : "Search stories, SKUs, sources…"
          }
          className="max-w-md"
        />
        <span className="text-xs text-muted-foreground">
          {isLoading
            ? fr
              ? "Chargement…"
              : "Loading…"
            : fr
              ? `${editorialCount} rédigée(s) · ${stories.length} ligne(s)`
              : `${editorialCount} editorial · ${stories.length} row(s)`}
          {isFetching && !isLoading ? "…" : ""}
        </span>
      </div>

      {isLoading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : stories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fr
            ? "Aucune chronique pour ce pack (ledger vide ou filtre trop étroit)."
            : "No stories for this pack (empty ledger or narrow filter)."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {stories.map((story) => (
            <li
              key={story.id}
              className="rounded-lg border border-border/70 bg-card/40 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    story.status === "editorial" ? "default" : "secondary"
                  }
                >
                  {story.status === "editorial"
                    ? fr
                      ? "Éditorial"
                      : "Editorial"
                    : fr
                      ? "À rédiger"
                      : "Draft"}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {story.id}
                </span>
              </div>

              <StoryBodyWithMentions
                body={story.bodyFr}
                packId={packId}
                locale={locale}
                className="text-foreground"
              />

              {(story.targets.sealed.length > 0 ||
                story.targets.prints.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {story.targets.sealed.map((slug) => (
                    <Badge
                      key={`s-${slug}`}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      sealed:{slug}
                    </Badge>
                  ))}
                  {story.targets.prints.map((pk) => (
                    <Badge
                      key={`p-${pk}`}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      {pk}
                    </Badge>
                  ))}
                </div>
              )}

              <ul className="mt-3 space-y-1 border-t border-border/50 pt-2">
                {story.sources.map((src) => (
                  <li key={src.url} className="text-[11px] text-muted-foreground">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
                    >
                      <ExternalLink className="mt-0.5 size-3 shrink-0" />
                      <span>
                        <span className="font-medium text-foreground/80">
                          {src.claim}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
