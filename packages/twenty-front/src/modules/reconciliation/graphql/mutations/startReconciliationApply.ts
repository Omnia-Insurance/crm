/**
 * Removed 2026-04-29: the reconciliation pipeline no longer has a separate
 * "apply" step. Inline accept and the per-record "Accept all" button fire
 * record mutations in real time, so the toolbar's "Apply N approved" button
 * was redundant and re-applied stale persisted diffs (silently undoing user
 * undos). This file is intentionally empty; safe to `git rm`.
 */
export {};
