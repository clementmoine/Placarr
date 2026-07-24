export type ResidualIdentityDecision = "accept" | "reject" | "uncertain";

export type ResidualIdentityInput = {
  requestTitles: string[];
  candidateTitles: string[];
  requestAuthors?: string[];
  candidateAuthors?: string[];
  /** When `hardware`, platform tokens are identity and catalog chrome is noise. */
  shelfType?: string | null;
};

export type ResidualIdentityResult = {
  decision: ResidualIdentityDecision;
  residualTokens: string[];
  requestResidualTokens: string[];
  reasons: string[];
};
