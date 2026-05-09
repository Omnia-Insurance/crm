#!/usr/bin/env bash
# Safe Convoso call backfill via the ingestion pipeline.
#
# Architecture:
#   1. Disables pipeline cadence at start (isEnabled: false). This stops the
#      5-minute cron from competing for the worker AND from accidentally
#      reading any date overrides we set.
#   2. For each day in the range, splits the day into sub-day chunks (default
#      6 hours) and triggers a manual pull per chunk. triggerIngestionPull
#      runs regardless of isEnabled, so manual triggers still work.
#   3. Halts the whole run if any chunk fails or times out client-side.
#   4. trap EXIT always restores the pipeline (re-enable + clear overrides),
#      even on Ctrl-C, SIGTERM, or unexpected error. This is the critical
#      safety guarantee that the previous Python wrapper lacked.
#
# Per-request timeouts on the server-side fetcher (ingestion-pull.job.ts)
# bound each Convoso HTTP request, so a stalled upstream produces a `failed`
# log within ~2 minutes instead of hanging indefinitely.
#
# Usage:
#   scripts/backfill-calls.sh \
#     --token <api-token> \
#     --start 2026-01-01 \
#     --end   2026-02-01 \
#     [--chunk-hours 6] \
#     [--url https://crm.omniaagent.com] \
#     [--pipeline-id <uuid>] \
#     [--chunk-timeout 600]

set -uo pipefail

URL="https://crm.omniaagent.com"
PIPELINE_NAME="Convoso Call Ingestion"
PIPELINE_ID=""
TOKEN=""
START=""
END=""
CHUNK_HOURS=6
CHUNK_TIMEOUT=600    # client-side cap per chunk; server timeout is 120s/page
POLL_INTERVAL=5
LOG_DIR="/tmp/backfill-logs"
PROGRESS_DIR="/tmp/backfill-progress"

usage() {
  sed -n 's/^# //p' "$0" | head -30
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --token)         TOKEN="$2"; shift 2 ;;
    --start)         START="$2"; shift 2 ;;
    --end)           END="$2"; shift 2 ;;
    --chunk-hours)   CHUNK_HOURS="$2"; shift 2 ;;
    --chunk-timeout) CHUNK_TIMEOUT="$2"; shift 2 ;;
    --url)           URL="$2"; shift 2 ;;
    --pipeline-id)   PIPELINE_ID="$2"; shift 2 ;;
    -h|--help)       usage ;;
    *)               echo "Unknown arg: $1" >&2; usage ;;
  esac
done

if [ -z "$TOKEN" ] || [ -z "$START" ] || [ -z "$END" ]; then
  echo "Required: --token, --start, --end" >&2
  usage
fi

# Reject chunk sizes that don't tile a 24h day cleanly so chunks always
# cover the full day with no gaps or overlaps.
case "$CHUNK_HOURS" in
  1|2|3|4|6|8|12|24) ;;
  *)
    echo "Error: --chunk-hours must divide 24 (1, 2, 3, 4, 6, 8, 12, 24)" >&2
    exit 1
    ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required" >&2
  exit 1
fi

mkdir -p "$LOG_DIR" "$PROGRESS_DIR"

# ---------- API helpers ----------

gql() {
  local query="$1"
  local variables="${2:-null}"
  local body
  body=$(jq -nc --arg q "$query" --argjson v "$variables" \
    '{query: $q} + (if $v == null then {} else {variables: $v} end)')
  curl -sS --max-time 30 -X POST "$URL/metadata" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body"
}

resolve_pipeline_id() {
  if [ -n "$PIPELINE_ID" ]; then
    echo "$PIPELINE_ID"
    return
  fi
  local result
  result=$(gql '{ ingestionPipelines { id name mode targetObjectNameSingular } }')
  PIPELINE_ID=$(echo "$result" | jq -r --arg n "$PIPELINE_NAME" \
    '.data.ingestionPipelines[] | select(.name == $n) | .id' | head -n1)
  if [ -z "$PIPELINE_ID" ] || [ "$PIPELINE_ID" = "null" ]; then
    echo "Error: could not resolve pipeline by name '$PIPELINE_NAME'" >&2
    echo "Pass --pipeline-id explicitly. Available pipelines:" >&2
    echo "$result" | jq '.data.ingestionPipelines' >&2
    exit 1
  fi
  echo "$PIPELINE_ID"
}

fetch_pipeline_state() {
  gql "{ ingestionPipeline(id: \"$PIPELINE_ID\") { id isEnabled sourceRequestConfig } }"
}

update_pipeline() {
  local update_json="$1"
  local variables
  variables=$(jq -nc --arg id "$PIPELINE_ID" --argjson u "$update_json" \
    '{input: {id: $id, update: $u}}')
  gql 'mutation U($input: UpdateIngestionPipelineInput!) {
        updateIngestionPipeline(input: $input) { id isEnabled sourceRequestConfig }
      }' "$variables" >/dev/null
}

trigger_pull() {
  gql "mutation { triggerIngestionPull(pipelineId: \"$PIPELINE_ID\") { id status } }"
}

list_recent_logs() {
  gql "{ ingestionLogs(pipelineId: \"$PIPELINE_ID\", limit: 20) {
          id status triggerType totalRecordsReceived recordsCreated
          recordsUpdated recordsFailed errors startedAt completedAt
        } }"
}

# ---------- Restore on exit ----------

ORIGINAL_CONFIG=""
ORIGINAL_ENABLED=""

restore_pipeline_state() {
  if [ -z "$ORIGINAL_CONFIG" ] || [ -z "$ORIGINAL_ENABLED" ]; then
    echo "[restore] no captured state, skipping"
    return
  fi
  echo
  echo "[restore] restoring pipeline state..."
  local update_json
  update_json=$(jq -nc \
    --argjson cfg "$ORIGINAL_CONFIG" \
    --argjson enabled "$ORIGINAL_ENABLED" \
    '{sourceRequestConfig: $cfg, isEnabled: $enabled}')
  if update_pipeline "$update_json"; then
    echo "[restore] OK (isEnabled=$ORIGINAL_ENABLED)"
  else
    echo "[restore] FAILED — manual restore required:"
    echo "$update_json"
  fi
}

trap restore_pipeline_state EXIT

# ---------- Main flow ----------

PIPELINE_ID=$(resolve_pipeline_id)
echo "Pipeline: $PIPELINE_ID"

state=$(fetch_pipeline_state)
ORIGINAL_CONFIG=$(echo "$state" | jq -c '.data.ingestionPipeline.sourceRequestConfig')
ORIGINAL_ENABLED=$(echo "$state" | jq -c '.data.ingestionPipeline.isEnabled')

if [ "$ORIGINAL_CONFIG" = "null" ] || [ -z "$ORIGINAL_CONFIG" ]; then
  echo "Error: could not read pipeline state" >&2
  exit 1
fi

echo "Original isEnabled: $ORIGINAL_ENABLED"
echo "Original config: $ORIGINAL_CONFIG"

# Strip any pre-existing date overrides from the baseline so they don't
# silently come back when we restore on exit.
RESTORE_CONFIG=$(echo "$ORIGINAL_CONFIG" | jq -c \
  'del(.dateRangeParams.startTimeOverride) | del(.dateRangeParams.endTimeOverride)')
ORIGINAL_CONFIG="$RESTORE_CONFIG"

echo "Pausing pipeline cadence..."
update_pipeline "$(jq -nc '{isEnabled: false}')"

month_label=$(echo "$START" | cut -c1-7)
LOG_FILE="$LOG_DIR/$month_label.log"
PROGRESS_FILE="$PROGRESS_DIR/$month_label.json"
echo "Per-run log: $LOG_FILE"
echo "Progress: $PROGRESS_FILE"

# Initialize or load progress.
if [ -f "$PROGRESS_FILE" ]; then
  echo "Found existing progress file, resuming"
else
  echo '{"completedChunks": [], "totalCreated": 0, "totalUpdated": 0, "totalFailed": 0}' > "$PROGRESS_FILE"
fi

# ---------- Date math ----------
# We loop day-by-day from START (inclusive) to END (exclusive).
# Within each day, we generate (24 / CHUNK_HOURS) chunks.
# Output format: YYYY-MM-DDTHH:MM:SS (Convoso-side timezone is set in pipeline config).

iso_date() {
  # advance $1 by $2 days; emit YYYY-MM-DD
  date -j -f "%Y-%m-%d" -v "+${2}d" "$1" "+%Y-%m-%d"
}

run_chunk() {
  local start_iso="$1"
  local end_iso="$2"
  local chunk_id="${start_iso}_${end_iso}"

  if jq -e --arg id "$chunk_id" '.completedChunks | index($id)' "$PROGRESS_FILE" >/dev/null; then
    echo "  [skip] $chunk_id (already completed)"
    return 0
  fi

  echo "  [chunk] $start_iso -> $end_iso"

  # Set overrides on top of the cleaned baseline config.
  local chunk_config
  chunk_config=$(echo "$ORIGINAL_CONFIG" | jq -c \
    --arg s "$start_iso" --arg e "$end_iso" \
    '.dateRangeParams.startTimeOverride = $s
     | .dateRangeParams.endTimeOverride = $e')
  update_pipeline "$(jq -nc --argjson c "$chunk_config" '{sourceRequestConfig: $c}')"

  local watch_started_at
  watch_started_at=$(date -u +%s)

  local known_log_ids
  known_log_ids=$(list_recent_logs | jq -c '[.data.ingestionLogs[].id]')

  trigger_pull >/dev/null

  local elapsed=0
  local tracked_log=""
  while [ "$elapsed" -lt "$CHUNK_TIMEOUT" ]; do
    sleep "$POLL_INTERVAL"
    elapsed=$(( $(date -u +%s) - watch_started_at ))

    local logs
    logs=$(list_recent_logs)

    if [ -z "$tracked_log" ]; then
      # Find a pull log that's not in known_log_ids and is new enough.
      tracked_log=$(echo "$logs" | jq -r --argjson known "$known_log_ids" --argjson watch "$watch_started_at" '
        .data.ingestionLogs[]
        | select(.triggerType == "pull")
        | select(.status == "running" or .status == "completed" or .status == "failed" or .status == "partial")
        | select(($known | index(.id)) | not)
        | .id' | head -n1)
      if [ -n "$tracked_log" ]; then
        echo "    log=$tracked_log"
      fi
      continue
    fi

    local entry status received created updated failed errors
    entry=$(echo "$logs" | jq -c --arg id "$tracked_log" '.data.ingestionLogs[] | select(.id == $id)')
    if [ -z "$entry" ] || [ "$entry" = "null" ]; then
      continue
    fi
    status=$(echo "$entry" | jq -r '.status')
    if [ "$status" = "completed" ] || [ "$status" = "partial" ]; then
      received=$(echo "$entry" | jq -r '.totalRecordsReceived // 0')
      created=$(echo "$entry" | jq -r '.recordsCreated // 0')
      updated=$(echo "$entry" | jq -r '.recordsUpdated // 0')
      failed=$(echo "$entry" | jq -r '.recordsFailed // 0')
      echo "    [${elapsed}s] $status received=$received created=$created updated=$updated failed=$failed"
      jq --arg id "$chunk_id" \
         --argjson c "$created" --argjson u "$updated" --argjson f "$failed" \
         '.completedChunks += [$id]
          | .totalCreated += $c
          | .totalUpdated += $u
          | .totalFailed += $f' \
         "$PROGRESS_FILE" > "$PROGRESS_FILE.tmp" && mv "$PROGRESS_FILE.tmp" "$PROGRESS_FILE"
      return 0
    fi
    if [ "$status" = "failed" ]; then
      errors=$(echo "$entry" | jq -c '.errors')
      echo "    [${elapsed}s] FAILED: $errors"
      return 1
    fi
    if [ $((elapsed % 30)) -eq 0 ] && [ "$elapsed" -gt 0 ]; then
      echo "    [${elapsed}s] still $status..."
    fi
  done

  echo "    Timed out after ${CHUNK_TIMEOUT}s (server-side timeout should have fired)"
  return 1
}

# Generate the day list.
days=()
cursor="$START"
while [ "$cursor" \< "$END" ]; do
  days+=("$cursor")
  cursor=$(iso_date "$cursor" 1)
done
echo "Days to process: ${#days[@]}"

# Per-day chunks.
chunks_per_day=$(( 24 / CHUNK_HOURS ))
echo "Chunks per day: $chunks_per_day (size: ${CHUNK_HOURS}h)"

failed=0
for day in "${days[@]}"; do
  echo
  echo "[day] $day"
  for ((i = 0; i < chunks_per_day; i++)); do
    start_h=$(printf "%02d" $((i * CHUNK_HOURS)))
    end_h_raw=$((i * CHUNK_HOURS + CHUNK_HOURS - 1))
    end_h=$(printf "%02d" $end_h_raw)
    start_iso="${day}T${start_h}:00:00"
    end_iso="${day}T${end_h}:59:59"
    if ! run_chunk "$start_iso" "$end_iso"; then
      failed=1
      break 2
    fi
  done
done

echo
echo "===== summary ====="
jq '.' "$PROGRESS_FILE"
if [ "$failed" -eq 1 ]; then
  echo "FAILED — chain halted. Re-run to resume; completed chunks will be skipped."
  exit 1
fi
echo "OK"
