"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  catalogueLineFamilies,
  cataloguePackInfo,
  type CatalogueFranchise,
  type CataloguePackId,
  type CataloguePackInfo,
} from "@/lib/admin/cataloguePacks";

export type CatalogueTopTab =
  | { kind: "franchise"; franchise: CatalogueFranchise }
  | { kind: "corpus"; providerId: string; label: string };

export function catalogueTopTabValue(tab: CatalogueTopTab): string {
  return tab.kind === "franchise"
    ? `franchise:${tab.franchise.id}`
    : `corpus:${tab.providerId}`;
}

/**
 * Barre de choix Catalogue : franchise (ou index) + ligne si la franchise en a
 * plusieurs. Un seul langage de contrôle (select), groupes par éditeur.
 */
export function CatalogueNav({
  topTabs,
  topValue,
  onTopChange,
  lines,
  packId,
  onPackChange,
  locale,
}: {
  topTabs: readonly CatalogueTopTab[];
  topValue: string;
  onTopChange: (value: string) => void;
  lines: readonly CataloguePackInfo[];
  packId: CataloguePackId | null;
  onPackChange: (packId: CataloguePackId) => void;
  locale: string;
}) {
  const fr = locale === "fr";
  const franchiseTabs = topTabs.filter(
    (tab): tab is Extract<CatalogueTopTab, { kind: "franchise" }> =>
      tab.kind === "franchise",
  );
  const corpusTabs = topTabs.filter(
    (tab): tab is Extract<CatalogueTopTab, { kind: "corpus" }> =>
      tab.kind === "corpus",
  );

  const activeTop = topTabs.find((tab) => catalogueTopTabValue(tab) === topValue);
  const topLabel =
    activeTop?.kind === "franchise"
      ? fr
        ? activeTop.franchise.labelFr
        : activeTop.franchise.labelEn
      : activeTop?.kind === "corpus"
        ? activeTop.label
        : fr
          ? "Catalogue"
          : "Catalogue";

  const activePack =
    (packId ? cataloguePackInfo(packId) : null) ?? lines[0] ?? null;
  const lineLabel = activePack
    ? fr
      ? activePack.lineLabelFr
      : activePack.lineLabelEn
    : "";
  const familyLabel = activePack?.lineFamily
    ? fr
      ? activePack.lineFamily.labelFr
      : activePack.lineFamily.labelEn
    : null;
  const lineTrigger = familyLabel
    ? `${familyLabel} · ${lineLabel}`
    : lineLabel;

  const showLine = lines.length > 1 && packId !== null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select value={topValue} onValueChange={onTopChange}>
        <SelectTrigger
          size="sm"
          className="min-w-[9rem] max-w-[14rem]"
          aria-label={fr ? "Franchise" : "Franchise"}
        >
          <SelectValue>{topLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {franchiseTabs.length > 0 ? (
            <SelectGroup>
              <SelectLabel>
                {fr ? "Jeux" : "Games"}
              </SelectLabel>
              {franchiseTabs.map((tab) => (
                <SelectItem
                  key={catalogueTopTabValue(tab)}
                  value={catalogueTopTabValue(tab)}
                >
                  {fr ? tab.franchise.labelFr : tab.franchise.labelEn}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          {corpusTabs.length > 0 ? (
            <SelectGroup>
              <SelectLabel>
                {fr ? "Indexes" : "Indexes"}
              </SelectLabel>
              {corpusTabs.map((tab) => (
                <SelectItem
                  key={catalogueTopTabValue(tab)}
                  value={catalogueTopTabValue(tab)}
                >
                  {tab.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>

      {showLine ? (
        <Select
          value={packId}
          onValueChange={(next) => onPackChange(next as CataloguePackId)}
        >
          <SelectTrigger
            size="sm"
            className="min-w-[12rem] max-w-[20rem]"
            aria-label={fr ? "Ligne du catalogue" : "Catalogue line"}
          >
            <SelectValue
              placeholder={fr ? "Choisir une ligne" : "Choose a line"}
            >
              {lineTrigger}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {catalogueLineFamilies(lines).map((family) => (
              <SelectGroup key={family.id}>
                <SelectLabel>
                  {fr ? family.labelFr : family.labelEn}
                </SelectLabel>
                {family.lines.map((line) => (
                  <SelectItem key={line.id} value={line.id}>
                    {fr ? line.lineLabelFr : line.lineLabelEn}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
