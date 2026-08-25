/**
 * Les crochets de catalogue d'un pack de cartes : état, rafraîchissement, trace.
 *
 * Le corps ne différait entre packs que par l'id, le chemin de la base et le
 * nom du pipeline — neuf lignes sur cinquante entre les deux jumeaux Dragon
 * Ball. Ce qu'il fait, en revanche, est le même partout : lancer la moisson du
 * pack, puis **écrire quand elle a fini**, ce qui est la seule chose dont
 * l'écran d'admin a besoin pour dire depuis quand un catalogue date.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packLogsDir } from "@/lib/packPaths";
import {
  dataPackPath,
  statusFromLastRun,
} from "@/providers/shared/catalogCorpus";
import type {
  ProviderCatalogRefreshOpts,
  ProviderCatalogStatus,
} from "@/types/providerModule";

export type CardCatalogueHooksInput = {
  packId: string;
  /** Chemin de la base du pack — sa présence dit qu'il y a quelque chose. */
  dbPath: () => string;
  /**
   * Lance la moisson. Le pack la charge lui-même, à la demande : un pipeline
   * tire des modules serveur que les chemins de lecture n'ont pas à payer.
   */
  runPipeline: (argv: string[]) => Promise<unknown>;
  /**
   * Ce qu'on saute quand la passe est **automatique**.
   *
   * Un rafraîchissement horaire n'a pas les mêmes droits qu'un clic : le graphe
   * produit se moissonne sur un hôte qui ralentit les rafales, ce qui est
   * acceptable à la demande et pas toutes les heures.
   */
  autoSkip?: readonly string[];
  /**
   * Arguments supplémentaires en tête quand la passe est automatique
   * (ex. `--offline` pour ne pas retélécharger les faces Naruto).
   */
  autoExtraArgs?: readonly string[];
};

/**
 * Déclaré à plat, sans croiser `ProviderCatalogHooks`.
 *
 * Le contrat autorise un `status` synchrone **ou** asynchrone. Une intersection
 * garde l'union, et l'appelant devait alors affirmer laquelle il tenait — alors
 * que celle-ci est toujours synchrone. Le type reste assignable au contrat,
 * puisqu'il en est un cas particulier.
 */
export type CardCatalogueHooks = {
  dataPack: string;
  status: () => ProviderCatalogStatus;
  refresh: (opts?: ProviderCatalogRefreshOpts) => Promise<void>;
};

function csvTokens(values: readonly string[] | undefined): string | null {
  if (!values?.length) return null;
  const tokens = values
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return tokens.length ? tokens.join(",") : null;
}

/**
 * Build CLI argv for a card-pack refresh. Pure — unit-tested.
 * Manual opts (`only` / `skip` / `langs` / `limit`) compose with auto defaults.
 */
export function catalogueRefreshArgv(
  opts: ProviderCatalogRefreshOpts | undefined,
  input: Pick<CardCatalogueHooksInput, "autoSkip" | "autoExtraArgs">,
): string[] {
  const argv: string[] = [];
  if (opts?.auto) {
    if (input.autoExtraArgs?.length) {
      argv.push(...input.autoExtraArgs);
    }
  }

  const only = csvTokens(opts?.only);
  if (only) argv.push("--only", only);

  const skipParts = [
    ...(opts?.auto && input.autoSkip?.length ? input.autoSkip : []),
    ...(opts?.skip ?? []),
  ];
  const skip = csvTokens(skipParts);
  if (skip) argv.push("--skip", skip);

  const langs = csvTokens(opts?.langs);
  if (langs) argv.push("--langs", langs);

  if (opts?.limit != null && Number.isFinite(opts.limit) && opts.limit > 0) {
    argv.push("--limit", String(Math.floor(opts.limit)));
  }

  return argv;
}

export function cardCatalogueHooks(
  input: CardCatalogueHooksInput,
): CardCatalogueHooks {
  const status = () => {
    const empty =
      !existsSync(input.dbPath()) &&
      !existsSync(dataPackPath(input.packId, "cards-index.json"));
    return statusFromLastRun({ dataPack: input.packId, empty });
  };

  const refresh = async (opts?: ProviderCatalogRefreshOpts): Promise<void> => {
    const argv = catalogueRefreshArgv(opts, input);
    await input.runPipeline(argv);
    /*
      La trace est écrite **après**, et seulement si la moisson n'a pas jeté :
      une date de dernier passage qui ment est pire que pas de date du tout, on
      croirait le catalogue frais.
    */
    const logs = packLogsDir(input.packId);
    mkdirSync(logs, { recursive: true });
    writeFileSync(
      path.join(logs, "last-run.json"),
      `${JSON.stringify({
        finishedAt: new Date().toISOString(),
        auto: Boolean(opts?.auto),
        only: opts?.only ?? null,
        skip: opts?.skip ?? null,
        langs: opts?.langs ?? null,
        limit: opts?.limit ?? null,
      })}\n`,
    );
  };

  return { dataPack: input.packId, status, refresh };
}
