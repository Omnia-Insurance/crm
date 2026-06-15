// OMNIA-CUSTOM: result DTO for the validateCarrierConfig query (OMN-11;
// multi-carrier readiness audit 2026-06-11 §"validateCarrierConfig resolver
// with preview"). The resolver never throws on config problems — everything
// lands in `errors` so the operator's edit → validate → run loop is a single
// synchronous call instead of a burned reconciliation run.

import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('ValidateCarrierConfigResult')
export class ValidateCarrierConfigResultDTO {
  /** True when the config would pass every parse/match fail-fast gate. */
  @Field(() => Boolean)
  valid: boolean;

  /** Fatal problems — each one would fail a real run at PARSE or MATCH. */
  @Field(() => [String])
  errors: string[];

  /** Non-fatal diagnostics (legacy fallbacks, ignored keys, unresolved
   *  optional status roles) that a real run would only log. */
  @Field(() => [String])
  warnings: string[];

  /** Resolved status engine id (statusConfig.engineId → parserVersion →
   *  legacy default), or null when the config JSON itself is malformed. */
  @Field(() => String, { nullable: true })
  engineId: string | null;

  /** Resolved matching start-date cutoff (null = no cutoff). Surfaced so a
   *  silently-inherited Ambetter default is visible pre-run. */
  @Field(() => String, { nullable: true })
  startDate: string | null;

  /** Required status-engine roles that are missing from
   *  statusConfig.fieldMapping or (when headersChecked) resolve to no file
   *  header / computed-field output. */
  @Field(() => [String])
  requiredRolesMissing: string[];

  /** True when role resolution ran against the actual headers of this
   *  carrier's most recent parsed run; false = presence-only validation
   *  (no previous parsed run to preview against). */
  @Field(() => Boolean)
  headersChecked: boolean;
}
