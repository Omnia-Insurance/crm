// Confidence (0-100) from which a match is auto-match grade. Shared by the
// matching engine default and the review UI's high-confidence batch apply, so
// the confirm-dialog count matches what the server applies. Carrier configs
// may still override the engine threshold.
export const RECONCILIATION_DEFAULT_AUTO_MATCH_THRESHOLD = 85;
