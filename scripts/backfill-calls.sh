#!/usr/bin/env bash
# Convoso call backfill via the ingestion pipeline (parallel).
#
# Architecture (v2: per-trigger date overrides):
#   1. Each chunk passes its date window via the GraphQL mutation arguments
#      directly (startTime/endTime). The worker reads them from job data; the
#      shared pipeline.sourceRequestConfig is never mutated. That means we
#      can fire many chunks in parallel — each trigger carries its own window
#      in its own job-data record, with no contention.
#   2. Live cadence pulls keep running normally throughout (they leave the
#      override args unset and use the pipeline's lookback config). No need
#      to disable the pipeline or restore anything on exit.
#   3. Within each batch of size --parallelism, all chunks are triggered, then
#      polled together until they all reach a terminal status. Then the next
#      batch fires.
#   4. Halts the run if any chunk fails or the batch times out.
#
# Per-request server-side timeout (ingestion-pull.job.ts) bounds each Convoso
# HTTP request so a stalled upstream produces a `failed` log within ~2 min
# instead of hanging indefinitely.
#
# Usage:
#   scripts/backfill-calls.sh \
#     --token <api-token> \
#     --start 2025-11-01 \
#     --end   2025-12-01 \
#     [--chunk-hours 6] \
#     [--parallelism 4] \
#     [--url https://crm.omniaagent.com] \
#     [--pipeline-id <uuid>] \
#     [--chunk-timeout 1800]

set -uo pipefail

URL="https://crm.omniaagent.com"
PIPELINE_NAME="Convoso Call Ingestion"
PIPELINE_ID=""
TOKEN=""
START=""
END=""
CHUNK_HOURS=6
PARALLELISM=4
CHUNK_TIMEOUT=1800   # client-side cap per batch
POLL_INTERVAL=5
LOG_DIR="/tmp/backfill-logs"
PROGRESS_DIR="/tmp/backfill-progress"

usage() {
  sed -n 's/^# //p' "$0" | head -32
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --token)         TOKEN="$2"; shift 2 ;;
    --start)         START="$2"; shift 2 ;;
    --end)           END="$2"; shift 2 ;;
    --chunk-hours)   CHUNK_HOURS="$2"; shift 2 ;;
    --parallelism)   PARALLELISM="$2"; shift 2 ;;
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

  local response=""
  local attempt=0
  while [ "$attempt" -lt 3 ]; do
    response=$(curl -sS --max-time 30 -X POST "$URL/metadata" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body" 2>/dev/null)
    if echo "$response" | jq -e '.' >/dev/null 2>&1; then
      echo "$response"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  echo "[gql] non-JSON response after 3 attempts: ${response:0:200}" >&2
  echo '{"data":null,"errors":[{"message":"gql call failed after retries"}]}'
  return 1
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

# Trigger one pull with per-trigger date overrides. Returns the placeholder
# log id from the resolver (used as a unique trigger marker so we can
# distinguish "our placeholders" from "the worker logs we want to poll").
trigger_pull() {
  local start_iso="$1"
  local end_iso="$2"
  local response
  response=$(gql "mutation { triggerIngestionPull(pipelineId: \"$PIPELINE_ID\", startTime: \"$start_iso\", endTime: \"$end_iso\") { id status } }")
  echo "$response" | jq -r '.data.triggerIngestionPull.id // empty'
}

list_recent_logs() {
  # Pull enough logs to cover up to PARALLELISM batches' worth of placeholders
  # plus the corresponding worker logs (2x), with headroom for live cadence.
  local limit=$((PARALLELISM * 4 + 10))
  gql "{ ingestionLogs(pipelineId: \"$PIPELINE_ID\", limit: $limit) {
          id status triggerType totalRecordsReceived recordsCreated
          recordsUpdated recordsFailed errors startedAt completedAt
        } }"
}

# ---------- Main ----------

PIPELINE_ID=$(resolve_pipeline_id)
echo "Pipeline: $PIPELINE_ID"
echo "Parallelism: $PARALLELISM"
echo "Chunk size: ${CHUNK_HOURS}h"

month_label=$(echo "$START" | cut -c1-7)
LOG_FILE="$LOG_DIR/$month_label.log"
PROGRESS_FILE="$PROGRESS_DIR/$month_label.json"
echo "Log: $LOG_FILE"
echo "Progress: $PROGRESS_FILE"

if [ -f "$PROGRESS_FILE" ]; then
  echo "Found existing progress, resuming"
else
  echo '{"completedChunks": [], "totalCreated": 0, "totalUpdated": 0, "totalFailed": 0}' > "$PROGRESS_FILE"
fi

# ---------- Build chunk list ----------

iso_date() {
  date -j -f "%Y-%m-%d" -v "+${2}d" "$1" "+%Y-%m-%d"
}

days=()
cursor="$START"
while [ "$cursor" \< "$END" ]; do
  days+=("$cursor")
  cursor=$(iso_date "$cursor" 1)
done
chunks_per_day=$(( 24 / CHUNK_HOURS ))

# All chunks: array of "chunk_id|start_iso|end_iso" strings.
all_chunks=()
for day in "${days[@]}"; do
  for ((i = 0; i < chunks_per_day; i++)); do
    start_h=$(printf "%02d" $((i * CHUNK_HOURS)))
    end_h_raw=$((i * CHUNK_HOURS + CHUNK_HOURS - 1))
    end_h=$(printf "%02d" $end_h_raw)
    start_iso="${day}T${start_h}:00:00"
    end_iso="${day}T${end_h}:59:59"
    chunk_id="${start_iso}_${end_iso}"
    all_chunks+=("${chunk_id}|${start_iso}|${end_iso}")
  done
done

# Filter to remaining (not already completed).
remaining_chunks=()
for entry in "${all_chunks[@]}"; do
  IFS='|' read -r chunk_id _ _ <<< "$entry"
  if jq -e --arg id "$chunk_id" '.completedChunks | index($id)' "$PROGRESS_FILE" >/dev/null; then
    continue
  fi
  remaining_chunks+=("$entry")
done

echo "Total chunks: ${#all_chunks[@]}"
echo "Remaining: ${#remaining_chunks[@]}"

# ---------- Batch processing ----------

# Process a batch of N chunks in parallel. All triggers fire, then we poll
# for completion of all worker logs that started after our watch timestamp.
# Returns 0 if all chunks completed, 1 on any failure or timeout.
process_batch() {
  local batch=("$@")
  local size=${#batch[@]}

  # Capture state before triggering so we can identify NEW worker logs.
  local watch_started_at
  watch_started_at=$(date -u +%s)
  local known_log_ids
  known_log_ids=$(list_recent_logs | jq -c 'try [.data.ingestionLogs[].id] catch []' 2>/dev/null)
  if ! echo "$known_log_ids" | jq -e 'type == "array"' >/dev/null 2>&1; then
    known_log_ids='[]'
  fi

  # Trigger all chunks. Each returns a placeholder log id which we add to
  # known_log_ids so polling only matches worker-created logs.
  local placeholder_ids=()
  for entry in "${batch[@]}"; do
    IFS='|' read -r chunk_id start_iso end_iso <<< "$entry"
    echo "  [trigger] $start_iso -> $end_iso"
    local placeholder
    placeholder=$(trigger_pull "$start_iso" "$end_iso")
    if [ -z "$placeholder" ]; then
      echo "    [warn] no placeholder id returned"
    else
      placeholder_ids+=("$placeholder")
    fi
  done

  # Add placeholders to known set so we don't track them as worker logs.
  local placeholders_json
  placeholders_json=$(printf '%s\n' "${placeholder_ids[@]}" | jq -R . | jq -sc .)
  known_log_ids=$(echo "$known_log_ids $placeholders_json" | jq -sc 'add | unique')

  # Poll: wait for `size` worker logs (NEW pull logs not in known set,
  # started after watch_started_at) to reach a terminal status.
  local elapsed=0
  local terminal_logs="[]"
  while [ "$elapsed" -lt "$CHUNK_TIMEOUT" ]; do
    sleep "$POLL_INTERVAL"
    elapsed=$(( $(date -u +%s) - watch_started_at ))

    local logs
    logs=$(list_recent_logs)

    terminal_logs=$(echo "$logs" | jq -c \
      --argjson known "$known_log_ids" \
      --argjson watch "$watch_started_at" \
      '
        [.data.ingestionLogs[]
          | select(.triggerType == "pull")
          | .id as $logId
          | select(($known | index($logId)) | not)
          | select(.startedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 >= ($watch - 15))
          | select(.status == "completed" or .status == "failed" or .status == "partial")
        ]
      ' 2>/dev/null)
    if [ -z "$terminal_logs" ] || [ "$terminal_logs" = "null" ]; then
      terminal_logs="[]"
    fi

    local count
    count=$(echo "$terminal_logs" | jq 'length')

    if [ "$count" -ge "$size" ]; then
      break
    fi

    if [ $((elapsed % 30)) -eq 0 ] && [ "$elapsed" -gt 0 ]; then
      echo "    [${elapsed}s] $count/$size terminal..."
    fi
  done

  if [ "$elapsed" -ge "$CHUNK_TIMEOUT" ]; then
    echo "    Timed out after ${CHUNK_TIMEOUT}s; got ${count:-0}/${size}"
    return 1
  fi

  # Aggregate. Did any fail?
  local any_failed
  any_failed=$(echo "$terminal_logs" | jq '[.[] | select(.status == "failed")] | length')
  if [ "$any_failed" -gt 0 ]; then
    echo "    [${elapsed}s] $any_failed of $size chunks FAILED"
    echo "$terminal_logs" | jq '[.[] | select(.status == "failed") | {id, errors}]' >&2
    # Mark the SUCCESSFUL chunks as completed before returning failure,
    # so resume picks up where we left off rather than retrying succeeded work.
  fi

  # Aggregate stats across the worker logs.
  local total_received total_created total_updated total_failed
  total_received=$(echo "$terminal_logs" | jq '[.[] | (.totalRecordsReceived // 0)] | add // 0')
  total_created=$(echo "$terminal_logs" | jq '[.[] | (.recordsCreated // 0)] | add // 0')
  total_updated=$(echo "$terminal_logs" | jq '[.[] | (.recordsUpdated // 0)] | add // 0')
  total_failed=$(echo "$terminal_logs" | jq '[.[] | (.recordsFailed // 0)] | add // 0')
  echo "    [${elapsed}s] batch done: received=$total_received created=$total_created updated=$total_updated failed=$total_failed"

  # Mark every chunk in the batch as completed.
  # Caveat: if a specific chunk's pull failed we can't tell which one (we
  # don't correlate placeholder<->worker logs). For simplicity we mark all
  # batch chunks completed iff there were no failures; on any failure the
  # whole batch is considered halted and resume retries them all.
  if [ "$any_failed" -gt 0 ]; then
    return 1
  fi

  local chunk_ids_json
  chunk_ids_json=$(printf '%s\n' "${batch[@]}" | awk -F'|' '{print $1}' | jq -R . | jq -sc .)
  jq --argjson new_ids "$chunk_ids_json" \
     --argjson c "$total_created" \
     --argjson u "$total_updated" \
     --argjson f "$total_failed" \
     '.completedChunks += $new_ids
      | .totalCreated += $c
      | .totalUpdated += $u
      | .totalFailed += $f' \
     "$PROGRESS_FILE" > "$PROGRESS_FILE.tmp" && mv "$PROGRESS_FILE.tmp" "$PROGRESS_FILE"

  return 0
}

# ---------- Loop ----------

failed=0
batch_num=0
i=0
while [ "$i" -lt "${#remaining_chunks[@]}" ]; do
  batch=()
  for ((j = 0; j < PARALLELISM && (i + j) < ${#remaining_chunks[@]}; j++)); do
    batch+=("${remaining_chunks[$((i + j))]}")
  done
  i=$((i + ${#batch[@]}))
  batch_num=$((batch_num + 1))

  echo
  echo "[batch $batch_num] ${#batch[@]} chunks ($i of ${#remaining_chunks[@]} processed)"
  if ! process_batch "${batch[@]}"; then
    failed=1
    break
  fi
done

echo
echo "===== summary ====="
jq '.' "$PROGRESS_FILE"
if [ "$failed" -eq 1 ]; then
  echo "FAILED — chain halted. Re-run to resume; completed chunks will be skipped."
  exit 1
fi
echo "OK"
