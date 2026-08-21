"use client";

/**
 * La check-list d'une étagère — à l'écran, et sur papier.
 *
 * Une page à part plutôt qu'un panneau : c'est ce qui la rend **imprimable**.
 * Le navigateur sait déjà faire un PDF d'une page ; la mise en page d'impression
 * vit donc dans la feuille de style, et aucune dépendance n'est ajoutée pour
 * générer un document qu'on sait déjà produire.
 *
 * Les trois groupes portent l'information : en cours, terminés, pas commencés.
 * Ce n'est pas un classement par avancement — dans chacun, les extensions sont
 * dans leur ordre de sortie.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2, Printer } from "lucide-react";

import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { printLanguageLabel } from "@/lib/shared/printLanguages";
import { cn } from "@/lib/shared/utils";
import styles from "./checklist.module.css";

type ChecklistPrint = {
  printKey: string;
  reference: string;
  title: string;
  thumbnailUrl?: string | null;
};

type ChecklistSet = {
  id: string;
  label: string;
  group?: string | null;
  total: number;
  owned: number;
  completion: number;
  missing: ChecklistPrint[];
};

type ChecklistResponse = {
  shelf: { id: string; name: string | null; slug: string | null };
  language: string | null;
  languages: string[];
  sets: ChecklistSet[];
  completedSets: ChecklistSet[];
  untouchedSets: ChecklistSet[];
  setsWithoutCatalogue: { id: string; label: string }[];
  totals: { total: number; owned: number; completion: number };
};

function CompletionBar({ value }: { value: number }) {
  return (
    <div className={styles.bar} role="presentation">
      <div className={styles.barFill} style={{ width: `${value}%` }} />
    </div>
  );
}

function SetRow({
  set,
  expandable,
  t,
}: {
  set: ChecklistSet;
  expandable: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className={styles.setRow}>
      <button
        type="button"
        className={styles.setHead}
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
      >
        {expandable && (
          <ChevronRight
            className={cn(styles.chevron, open && styles.chevronOpen)}
            aria-hidden
          />
        )}
        <span className={styles.setLabel}>{set.label}</span>
        <span className={styles.setCount}>
          {t("items.checklistOwnedOf", { owned: set.owned, total: set.total })}
        </span>
        <CompletionBar value={set.completion} />
        <span className={styles.setPct}>{set.completion}%</span>
      </button>

      {/*
        Les manquantes sont dépliées à l'écran et **toujours visibles à
        l'impression** : une check-list papier qu'il faut déplier n'en est pas
        une.
      */}
      {set.missing.length > 0 && (
        <ol className={cn(styles.missing, open && styles.missingOpen)}>
          {set.missing.map((row) => (
            <li key={row.printKey} className={styles.missingRow}>
              <span className={styles.checkbox} aria-hidden />
              <span className={styles.ref}>{row.reference}</span>
              <span className={styles.name}>{row.title}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export default function ChecklistPage() {
  const params = useParams<{ shelfId: string }>();
  const shelfId = params?.shelfId ?? "";
  const { t } = useLocale();
  const [language, setLanguage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["checklist", shelfId, language],
    queryFn: async (): Promise<ChecklistResponse> => {
      const url = `/api/shelves/${encodeURIComponent(shelfId)}/checklist${
        language ? `?language=${encodeURIComponent(language)}` : ""
      }`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as ChecklistResponse;
    },
    enabled: Boolean(shelfId),
  });

  const groups = useMemo(
    () =>
      data
        ? [
            { key: "inProgress", sets: data.sets, expandable: true },
            { key: "completed", sets: data.completedSets, expandable: false },
            { key: "untouched", sets: data.untouchedSets, expandable: true },
          ].filter((group) => group.sets.length > 0)
        : [],
    [data],
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headBar}>
          <Link
            href={`/shelves/${encodeURIComponent(shelfId)}`}
            className={styles.back}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {data?.shelf.name ?? ""}
          </Link>

          <div className={styles.actions}>
            {(data?.languages.length ?? 0) > 1 && (
              <select
                value={data?.language ?? ""}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label={t("items.checklistLanguage")}
                className={styles.select}
              >
                {data?.languages.map((code) => {
                  const label = printLanguageLabel(code);
                  return (
                    <option key={code} value={code}>
                      {label.flag} {label.name}
                    </option>
                  );
                })}
              </select>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className={styles.print}
            >
              <Printer className="size-4" aria-hidden />
              {t("items.checklistPrint")}
            </button>
          </div>
        </div>

        <h1 className={styles.title}>{t("items.checklistTitle")}</h1>
        <p className={styles.subtitle}>{t("items.checklistSubtitle")}</p>

        {data && (
          <div className={styles.totals}>
            <strong>
              {t("items.checklistOwnedOf", {
                owned: data.totals.owned,
                total: data.totals.total,
              })}
            </strong>
            <CompletionBar value={data.totals.completion} />
            <span>{data.totals.completion}%</span>
          </div>
        )}
      </header>

      {isLoading && (
        <p className={styles.loading}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </p>
      )}

      {data && data.totals.total === 0 && !isLoading && (
        <p className={styles.empty}>{t("items.checklistEmpty")}</p>
      )}

      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <h2 className={styles.groupTitle}>
            {t(
              `items.checklist${group.key[0]!.toUpperCase()}${group.key.slice(1)}`,
            )}
            <span className={styles.groupCount}>{group.sets.length}</span>
          </h2>
          <ul className={styles.setList}>
            {group.sets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                expandable={group.expandable}
                t={t}
              />
            ))}
          </ul>
        </section>
      ))}

      {/*
        Ce que le catalogue ne tient pas se dit, il ne se tait pas : un set
        absent n'est pas un set complet, et la check-list ne peut pas mesurer
        ce qu'elle ignore.
      */}
      {(data?.setsWithoutCatalogue.length ?? 0) > 0 && (
        <section className={styles.group}>
          <h2 className={styles.groupTitle}>
            {t("items.checklistNoCatalogue")}
            <span className={styles.groupCount}>
              {data!.setsWithoutCatalogue.length}
            </span>
          </h2>
          <p className={styles.hint}>{t("items.checklistNoCatalogueHint")}</p>
          <ul className={styles.plainList}>
            {data!.setsWithoutCatalogue.map((set) => (
              <li key={set.id}>{set.label}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
