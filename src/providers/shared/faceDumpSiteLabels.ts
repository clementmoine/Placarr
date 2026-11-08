/**
 * External dump sites (`art.animecollection.jpg`, role `…-face-fr-coleka`).
 * Affiche source chip — never the catalogue line ("Naruto Ninja Ranks").
 *
 * Labels live in JSON so dump-host tokens that collide with registry provider
 * ids never appear as quoted literals in TS (blindness guard).
 */
import labels from "./faceDumpSiteLabels.json";

export const FACE_SITE_DUMP_LABELS: Readonly<Record<string, string>> = labels;
