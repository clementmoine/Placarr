"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import type { DetailFact } from "@/core/enrich/facts/playerFacts";
import {
  providerLinkDisplayLabel,
  sortProviderLinkFacts,
} from "@/core/enrich/facts/displayFacts";

import { faviconDomainForUrl, googleFaviconUrl } from "@/lib/url/favicon";

type ProviderLinksBarProps = {
  facts: DetailFact[];
  title: string;
  className?: string;
};

export function ProviderLinksBar({
  facts,
  title,
  className,
}: ProviderLinksBarProps) {
  const links = sortProviderLinkFacts(facts);
  if (links.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2 sm:col-span-2", className)}>
      <span className="select-none text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {title}
      </span>
      <div className="flex flex-wrap gap-2">
        {links.map((fact) => {
          const host = fact.url ? faviconDomainForUrl(fact.url) : null;
          const label = providerLinkDisplayLabel(fact);

          return (
            <a
              key={`${fact.label}-${fact.url}`}
              href={fact.url}
              target="_blank"
              rel="noopener noreferrer"
              title={fact.value !== label ? fact.value : undefined}
              className={cn(
                "inline-flex max-w-full items-center gap-2 rounded-full border border-border/70",
                "bg-background/80 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm",
                "transition-colors hover:border-primary/40 hover:bg-primary/5",
                "dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:hover:bg-primary/10",
              )}
            >
              {host ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={googleFaviconUrl(host)}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 shrink-0 rounded-sm"
                  loading="lazy"
                />
              ) : (
                <ExternalLink className="size-3.5 shrink-0 text-zinc-400" />
              )}
              <span className="truncate">{label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
