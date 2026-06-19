import { fetchFromAchatMoinsCher } from "@/services/providers/achatmoinscher";
import { fetchFromApriloshop } from "@/services/providers/apriloshop";
import { fetchFromChasseAuxLivres } from "@/services/providers/chasseauxlivres";
import { fetchFromDiscogs } from "@/services/providers/discogs";
import { fetchFromFreakxy } from "@/services/providers/freakxy";
import { fetchFromMusicBrainz } from "@/services/providers/musicbrainz";
import { fetchFromPicClick } from "@/services/providers/picclick";
import { fetchPricesFromLeDenicheur } from "@/services/providers/ledenicheur";
import { fetchFromScanDex } from "@/services/providers/scandex";
import {
  fetchFromDeezer,
  fetchFromOpenLibrary,
  fetchFromGoogleBooks,
} from "@/services/metadataResolvers";
import { fetchMetadataFromPriceCharting } from "@/services/providers/pricecharting";

import type { BarcodeLookupDeps } from "@/types/providerModule";

export function createBarcodeLookupDeps(): BarcodeLookupDeps {
  return {
    fetchMetadataFromPriceCharting,
    fetchFromChasseAuxLivres,
    fetchFromScanDex,
    fetchFromAchatMoinsCher,
    fetchFromFreakxy,
    fetchFromApriloshop,
    fetchFromPicClick,
    fetchPricesFromLeDenicheur,
    fetchFromOpenLibrary,
    fetchFromGoogleBooks,
    fetchFromDeezer,
    fetchFromMusicBrainz,
    fetchFromDiscogs,
  };
}
