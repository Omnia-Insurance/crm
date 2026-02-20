-- Add lead source field mapping to the Convoso Lead Sync pipeline.
-- The ConvosoLeadPreprocessor resolves list_id → Lead Source and injects _leadSourceId.
-- This mapping writes _leadSourceId → leadSourceId on the lead record.

-- First, find the pipeline ID:
-- SELECT id, name FROM core."ingestionPipeline" WHERE name ILIKE '%convoso%lead%';

-- Insert the field mapping (update the pipeline ID below)
INSERT INTO core."ingestionFieldMapping" (
  "id",
  "pipelineId",
  "sourceFieldPath",
  "targetFieldName",
  "targetCompositeSubField",
  "transform",
  "relationTargetObjectName",
  "relationMatchFieldName",
  "relationAutoCreate",
  "position"
)
SELECT
  gen_random_uuid(),
  id,
  '_leadSourceId',
  'leadSourceId',
  NULL,
  NULL,
  NULL,
  NULL,
  false,
  (SELECT COALESCE(MAX(position), 0) + 1 FROM core."ingestionFieldMapping" WHERE "pipelineId" = ip.id)
FROM core."ingestionPipeline" ip
WHERE name ILIKE '%convoso%lead%'
  AND NOT EXISTS (
    SELECT 1 FROM core."ingestionFieldMapping"
    WHERE "pipelineId" = ip.id AND "sourceFieldPath" = '_leadSourceId'
  );
