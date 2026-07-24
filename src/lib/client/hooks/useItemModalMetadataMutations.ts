import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

import { getMetadataPreview, getMetadataSuggestions } from "@/lib/api/metadata";
import { isAbortError } from "@/lib/http/abort";
import type { MetadataResult } from "@/types/metadataProvider";
import type { RomChecksums } from "@/types/providerModule";

type PreviewVariables = {
  name: string;
  barcode?: string;
  forceOverwrite?: boolean;
  romChecksums?: RomChecksums;
  requestId: number;
};

type SuggestionsVariables = {
  name: string;
  requestId: number;
};

type UseItemModalMetadataMutationsOptions = {
  activeShelfType?: string;
  activeShelfName?: string | null;
  applyMetadataPreviewToForm: (
    metadata: MetadataResult,
    options?: {
      forceOverwrite?: boolean;
      barcodeContext?: string;
    },
  ) => void;
  onSuggestionsLoaded?: (suggestions: string[], primary: string | null) => void;
};

export function useItemModalMetadataMutations({
  activeShelfType,
  activeShelfName,
  applyMetadataPreviewToForm,
  onSuggestionsLoaded,
}: UseItemModalMetadataMutationsOptions) {
  const previewRequestIdRef = useRef(0);
  const suggestionsRequestIdRef = useRef(0);

  const { mutate: mutatePreview, isPending: isFetchingMetadata } = useMutation({
    mutationFn: async ({
      name,
      barcode,
      romChecksums,
    }: PreviewVariables): Promise<MetadataResult | null> => {
      if (!name.trim() || !activeShelfType) return null;
      return getMetadataPreview(
        name,
        activeShelfType,
        barcode || null,
        null,
        activeShelfName || null,
        romChecksums,
      );
    },
    onSuccess: (metadata, variables) => {
      if (variables.requestId !== previewRequestIdRef.current) return;
      if (metadata) {
        applyMetadataPreviewToForm(metadata, {
          forceOverwrite: variables.forceOverwrite ?? false,
          barcodeContext: variables.barcode,
        });
      }
    },
    onError: (error) => {
      if (!isAbortError(error)) {
        console.error("Error fetching metadata preview:", error);
      }
    },
  });

  const { mutate: mutateSuggestions } = useMutation({
    mutationFn: async ({ name }: SuggestionsVariables): Promise<string[]> => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length < 2 || !activeShelfType) return [];
      const nextSuggestions = await getMetadataSuggestions(
        trimmed,
        activeShelfType,
        null,
        activeShelfName || null,
      );
      return Array.from(
        new Set(
          (nextSuggestions ?? []).filter((suggestion) => suggestion.trim()),
        ),
      );
    },
    onSuccess: (cleanSuggestions, variables) => {
      if (variables.requestId !== suggestionsRequestIdRef.current) return;
      if (cleanSuggestions.length === 0) return;
      onSuggestionsLoaded?.(cleanSuggestions, cleanSuggestions[0] ?? null);
    },
    onError: (error) => {
      if (!isAbortError(error)) {
        console.error("Error fetching name suggestions:", error);
      }
    },
  });

  const cancelMetadataRequests = useCallback(() => {
    previewRequestIdRef.current += 1;
    suggestionsRequestIdRef.current += 1;
  }, []);

  const fetchMetadataPreview = useCallback(
    (
      name: string,
      barcode?: string,
      forceOverwrite = false,
      romChecksums?: RomChecksums,
    ) => {
      if (!name.trim() || !activeShelfType) return;
      const requestId = ++previewRequestIdRef.current;
      mutatePreview({
        name,
        barcode,
        forceOverwrite,
        romChecksums,
        requestId,
      });
    },
    [activeShelfType, mutatePreview],
  );

  const fetchNameSuggestions = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length < 2 || !activeShelfType) return;
      const requestId = ++suggestionsRequestIdRef.current;
      mutateSuggestions({ name: trimmed, requestId });
    },
    [activeShelfType, mutateSuggestions],
  );

  return {
    fetchMetadataPreview,
    fetchNameSuggestions,
    isFetchingMetadata,
    cancelMetadataRequests,
  };
}
