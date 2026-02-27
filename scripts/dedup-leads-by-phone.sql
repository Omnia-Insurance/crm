-- Lead Deduplication by Phone Number
-- ==================================
-- This script deduplicates person records that share the same phone number.
--
-- Strategy:
--   1. For each group of duplicates, pick a "keeper" record:
--      - Prefer records that have policies attached (never delete those)
--      - Then prefer the most complete record (most non-null fields)
--      - Then prefer the most recently updated record
--   2. Merge non-null fields from duplicates into the keeper
--   3. Re-point all FK references from duplicates to the keeper
--   4. Soft-delete the duplicate records
--
-- Usage:
--   1. Replace <SCHEMA> with your workspace schema name (e.g., workspace_abc123)
--   2. Run the diagnostic query first to understand the scope
--   3. Run the full script inside a transaction (BEGIN / COMMIT or ROLLBACK)

-- ============================================================
-- STEP 0: SET YOUR SCHEMA (replace this placeholder everywhere)
-- ============================================================
-- Find your schema name:
--   SELECT "id", concat('workspace_', lower(replace(CAST("id" AS TEXT), '-', '')))
--   FROM core."workspace" LIMIT 5;
--
-- Then find/replace <SCHEMA> with the actual schema name below.

-- ============================================================
-- STEP 1: DIAGNOSTIC — Run this first to assess scope
-- ============================================================

-- Count duplicate phone numbers
SELECT "phonesPrimaryPhoneNumber", COUNT(*) as dup_count,
       ARRAY_AGG(id ORDER BY "updatedAt" DESC) as person_ids
FROM "<SCHEMA>"."person"
WHERE "phonesPrimaryPhoneNumber" IS NOT NULL
  AND "phonesPrimaryPhoneNumber" != ''
  AND "deletedAt" IS NULL
GROUP BY "phonesPrimaryPhoneNumber"
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- ============================================================
-- STEP 2: DEDUP — Run inside a transaction
-- ============================================================

BEGIN;

-- Create a temp table scoring each person in a duplicate group
CREATE TEMP TABLE person_dedup AS
WITH duplicates AS (
  SELECT
    p.id,
    p."phonesPrimaryPhoneNumber" as phone,
    p."updatedAt",
    -- Score by field completeness (count non-null useful fields)
    (CASE WHEN p."nameFirstName" IS NOT NULL AND p."nameFirstName" != '' THEN 1 ELSE 0 END
     + CASE WHEN p."nameLastName" IS NOT NULL AND p."nameLastName" != '' THEN 1 ELSE 0 END
     + CASE WHEN p."emailsPrimaryEmail" IS NOT NULL AND p."emailsPrimaryEmail" != '' THEN 1 ELSE 0 END
     + CASE WHEN p."city" IS NOT NULL AND p."city" != '' THEN 1 ELSE 0 END
     + CASE WHEN p."jobTitle" IS NOT NULL AND p."jobTitle" != '' THEN 1 ELSE 0 END
     + CASE WHEN p."companyId" IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN p."position" IS NOT NULL THEN 1 ELSE 0 END
    ) as completeness_score,
    -- Check if this person has policies attached
    CASE WHEN EXISTS (
      SELECT 1 FROM "<SCHEMA>"."policy" pol
      WHERE pol."leadId" = p.id AND pol."deletedAt" IS NULL
    ) THEN 1 ELSE 0 END as has_policies,
    -- Check if this person has calls attached
    CASE WHEN EXISTS (
      SELECT 1 FROM "<SCHEMA>"."call" c
      WHERE c."leadId" = p.id AND c."deletedAt" IS NULL
    ) THEN 1 ELSE 0 END as has_calls
  FROM "<SCHEMA>"."person" p
  WHERE p."phonesPrimaryPhoneNumber" IS NOT NULL
    AND p."phonesPrimaryPhoneNumber" != ''
    AND p."deletedAt" IS NULL
    AND p."phonesPrimaryPhoneNumber" IN (
      SELECT "phonesPrimaryPhoneNumber"
      FROM "<SCHEMA>"."person"
      WHERE "phonesPrimaryPhoneNumber" IS NOT NULL
        AND "phonesPrimaryPhoneNumber" != ''
        AND "deletedAt" IS NULL
      GROUP BY "phonesPrimaryPhoneNumber"
      HAVING COUNT(*) > 1
    )
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY phone
      ORDER BY
        has_policies DESC,       -- policy-linked records first
        has_calls DESC,          -- call-linked records next
        completeness_score DESC, -- most complete record
        "updatedAt" DESC         -- most recently updated
    ) as rank
  FROM duplicates
)
SELECT
  id,
  phone,
  rank,
  CASE WHEN rank = 1 THEN 'keeper' ELSE 'duplicate' END as disposition
FROM ranked;

-- Verify: show what we're about to do
SELECT phone,
       COUNT(*) FILTER (WHERE disposition = 'keeper') as keepers,
       COUNT(*) FILTER (WHERE disposition = 'duplicate') as duplicates_to_remove
FROM person_dedup
GROUP BY phone
ORDER BY duplicates_to_remove DESC;

-- ============================================================
-- STEP 3: MERGE — Fill in blanks on keeper from duplicates
-- ============================================================

-- For each keeper, update null fields from the best duplicate values
UPDATE "<SCHEMA>"."person" keeper
SET
  "nameFirstName" = COALESCE(keeper."nameFirstName",
    (SELECT d."nameFirstName" FROM "<SCHEMA>"."person" d
     INNER JOIN person_dedup pd ON pd.id = d.id AND pd.disposition = 'duplicate' AND pd.phone = kpd.phone
     WHERE d."nameFirstName" IS NOT NULL AND d."nameFirstName" != ''
     ORDER BY d."updatedAt" DESC LIMIT 1)),
  "nameLastName" = COALESCE(keeper."nameLastName",
    (SELECT d."nameLastName" FROM "<SCHEMA>"."person" d
     INNER JOIN person_dedup pd ON pd.id = d.id AND pd.disposition = 'duplicate' AND pd.phone = kpd.phone
     WHERE d."nameLastName" IS NOT NULL AND d."nameLastName" != ''
     ORDER BY d."updatedAt" DESC LIMIT 1)),
  "emailsPrimaryEmail" = COALESCE(NULLIF(keeper."emailsPrimaryEmail", ''),
    (SELECT d."emailsPrimaryEmail" FROM "<SCHEMA>"."person" d
     INNER JOIN person_dedup pd ON pd.id = d.id AND pd.disposition = 'duplicate' AND pd.phone = kpd.phone
     WHERE d."emailsPrimaryEmail" IS NOT NULL AND d."emailsPrimaryEmail" != ''
     ORDER BY d."updatedAt" DESC LIMIT 1)),
  "city" = COALESCE(NULLIF(keeper."city", ''),
    (SELECT d."city" FROM "<SCHEMA>"."person" d
     INNER JOIN person_dedup pd ON pd.id = d.id AND pd.disposition = 'duplicate' AND pd.phone = kpd.phone
     WHERE d."city" IS NOT NULL AND d."city" != ''
     ORDER BY d."updatedAt" DESC LIMIT 1)),
  "jobTitle" = COALESCE(NULLIF(keeper."jobTitle", ''),
    (SELECT d."jobTitle" FROM "<SCHEMA>"."person" d
     INNER JOIN person_dedup pd ON pd.id = d.id AND pd.disposition = 'duplicate' AND pd.phone = kpd.phone
     WHERE d."jobTitle" IS NOT NULL AND d."jobTitle" != ''
     ORDER BY d."updatedAt" DESC LIMIT 1)),
  "companyId" = COALESCE(keeper."companyId",
    (SELECT d."companyId" FROM "<SCHEMA>"."person" d
     INNER JOIN person_dedup pd ON pd.id = d.id AND pd.disposition = 'duplicate' AND pd.phone = kpd.phone
     WHERE d."companyId" IS NOT NULL
     ORDER BY d."updatedAt" DESC LIMIT 1))
FROM person_dedup kpd
WHERE keeper.id = kpd.id
  AND kpd.disposition = 'keeper';

-- ============================================================
-- STEP 4: RE-POINT FKs — Move all references to the keeper
-- ============================================================

-- Custom objects
UPDATE "<SCHEMA>"."policy" SET "leadId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "policy"."leadId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."call" SET "leadId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "call"."leadId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."familyMember" SET "leadId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "familyMember"."leadId" = dup.id AND dup.disposition = 'duplicate';

-- Standard objects
UPDATE "<SCHEMA>"."opportunity" SET "pointOfContactId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "opportunity"."pointOfContactId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."favorite" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "favorite"."personId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."attachment" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "attachment"."personId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."noteTarget" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "noteTarget"."personId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."taskTarget" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "taskTarget"."personId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."timelineActivity" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "timelineActivity"."personId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."calendarEventParticipant" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "calendarEventParticipant"."personId" = dup.id AND dup.disposition = 'duplicate';

UPDATE "<SCHEMA>"."messageParticipant" SET "personId" = keeper.id
FROM person_dedup dup
INNER JOIN person_dedup keeper ON keeper.phone = dup.phone AND keeper.disposition = 'keeper'
WHERE "messageParticipant"."personId" = dup.id AND dup.disposition = 'duplicate';

-- ============================================================
-- STEP 5: SOFT-DELETE duplicates
-- ============================================================

UPDATE "<SCHEMA>"."person"
SET "deletedAt" = NOW()
FROM person_dedup pd
WHERE person.id = pd.id
  AND pd.disposition = 'duplicate';

-- ============================================================
-- STEP 6: VERIFY
-- ============================================================

-- Should return 0 rows
SELECT "phonesPrimaryPhoneNumber", COUNT(*) as dup_count
FROM "<SCHEMA>"."person"
WHERE "phonesPrimaryPhoneNumber" IS NOT NULL
  AND "phonesPrimaryPhoneNumber" != ''
  AND "deletedAt" IS NULL
GROUP BY "phonesPrimaryPhoneNumber"
HAVING COUNT(*) > 1;

-- Verify all policies still have valid leadId references
SELECT pol.id as policy_id, pol."leadId"
FROM "<SCHEMA>"."policy" pol
LEFT JOIN "<SCHEMA>"."person" p ON p.id = pol."leadId" AND p."deletedAt" IS NULL
WHERE pol."deletedAt" IS NULL
  AND p.id IS NULL;

-- Verify all calls still have valid leadId references
SELECT c.id as call_id, c."leadId"
FROM "<SCHEMA>"."call" c
LEFT JOIN "<SCHEMA>"."person" p ON p.id = c."leadId" AND p."deletedAt" IS NULL
WHERE c."deletedAt" IS NULL
  AND c."leadId" IS NOT NULL
  AND p.id IS NULL;

-- Show summary
SELECT
  (SELECT COUNT(*) FROM person_dedup WHERE disposition = 'keeper') as keepers,
  (SELECT COUNT(*) FROM person_dedup WHERE disposition = 'duplicate') as duplicates_removed,
  (SELECT COUNT(DISTINCT phone) FROM person_dedup) as unique_phones_deduped;

-- Clean up temp table
DROP TABLE IF EXISTS person_dedup;

-- ============================================================
-- REVIEW THE RESULTS, THEN:
--   COMMIT;   -- to apply changes
--   ROLLBACK; -- to undo everything
-- ============================================================
