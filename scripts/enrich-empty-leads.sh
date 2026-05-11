#!/usr/bin/env bash
# Enrich empty-shell Person records (name/email/address) by phone lookup
# against Convoso's /leads/search API.
#
# Why a standalone script:
#   - Bypasses the server entirely — no BullMQ jobs, no Redis pressure, no
#     worker pool contention. Safe to run during business hours alongside
#     live ingestion.
#   - Direct prod DB writes via `kubectl exec ... psql`. One UPDATE per row.
#   - Direct Convoso API calls; rate-limited (default 10 RPS) so we don't
#     overwhelm either side.
#   - Resumable: tracks attempted person ids in a local progress file so
#     a re-run skips work already done (success OR confirmed no-match).
#
# Filters to backfill-created empties:
#   nameFirstName/nameLastName both null/empty, phone set, createdBySource
#   = 'MANUAL', createdAt >= 2026-05-08 (the start of the backfill).
#
# Tune --rate-rps lower if you see Convoso rate-limit responses or want to
# run more gently. For an overnight one-shot, 15-20 RPS is fine; for a
# business-hours background sweep, keep at 10 or lower.
#
# Usage:
#   scripts/enrich-empty-leads.sh --dry-run
#   scripts/enrich-empty-leads.sh --max-records 50
#   scripts/enrich-empty-leads.sh --rate-rps 15
#   scripts/enrich-empty-leads.sh                # no caps, runs through everything
#
# Recommended first run:
#   scripts/enrich-empty-leads.sh --dry-run --max-records 5
#   scripts/enrich-empty-leads.sh --max-records 20   # live test
#   scripts/enrich-empty-leads.sh                    # full run during off-hours

set -uo pipefail

NAMESPACE="twentycrm"
SERVER_DEPLOYMENT="my-twenty-twenty-server"
DB_HOST="twenty-crm-db.cluster-cgx4wwy00vhj.us-east-1.rds.amazonaws.com"
DB_USER="twenty_app_user"
DB_NAME="twenty"
WORKSPACE_SCHEMA="workspace_oyoiha4z71ppw867jthfb36d"
CONVOSO_API_BASE="https://api.convoso.com/v1"

RATE_RPS=10
WORKERS=4         # concurrent Convoso lookups (effective parallelism)
MAX_RECORDS=0     # 0 = no cap
DRY_RUN=false
TOKEN=""
PROGRESS_LOG="/tmp/enrich-empty-leads.log"   # append-only CSV: <pid>,<outcome>
PROGRESS_FILE="$PROGRESS_LOG"                 # kept for backwards-compat in messages

usage() {
  sed -n 's/^# //p' "$0" | head -38
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --token)        TOKEN="$2"; shift 2 ;;
    --rate-rps)     RATE_RPS="$2"; shift 2 ;;
    --workers)      WORKERS="$2"; shift 2 ;;
    --max-records)  MAX_RECORDS="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=true; shift ;;
    -h|--help)      usage ;;
    *)              echo "Unknown arg: $1" >&2; usage ;;
  esac
done

command -v jq >/dev/null || { echo "Error: jq required" >&2; exit 1; }
command -v kubectl >/dev/null || { echo "Error: kubectl required" >&2; exit 1; }
command -v curl >/dev/null || { echo "Error: curl required" >&2; exit 1; }

# ----- secrets / connections -----

DB_PASSWORD=$(kubectl get secret twenty-rds-credentials -n "$NAMESPACE" \
  -o jsonpath='{.data.password}' | base64 --decode)

if [ -z "$TOKEN" ]; then
  TOKEN=$(kubectl exec deployment/"$SERVER_DEPLOYMENT" -n "$NAMESPACE" -- \
    sh -c 'printf "%s" "$CONVOSO_API_TOKEN"' 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "Error: could not resolve CONVOSO_API_TOKEN (pass --token, or ensure server pod has it set)" >&2
  exit 1
fi

# ----- progress tracking -----

# Append-only CSV log. POSIX guarantees writes < PIPE_BUF (4KB on linux,
# 512B on macOS) under `>>` are atomic — so multiple concurrent workers
# can append rows without interleaving. Each row: <pid>,<outcome>.
touch "$PROGRESS_LOG"

mark_attempted() {
  local pid="$1"
  local outcome="$2"   # enriched | no_match | error
  if [ "$DRY_RUN" = "true" ]; then
    return  # dry-run never writes
  fi
  printf '%s,%s\n' "$pid" "$outcome" >> "$PROGRESS_LOG"
}

# ----- DB helpers -----

psql_exec() {
  # Pipe SQL via stdin so we never have to escape the double-quoted column
  # identifiers ("nameFirstName" etc.) through three layers of shell quoting.
  # ON_ERROR_STOP=1 makes psql exit non-zero on the first SQL error so
  # update_person can detect failures instead of silently moving on.
  local sql="$1"
  printf '%s\n' "$sql" | kubectl exec -i deployment/"$SERVER_DEPLOYMENT" \
    -n "$NAMESPACE" -- sh -c \
    "PGPASSWORD='$DB_PASSWORD' psql -v ON_ERROR_STOP=1 -h $DB_HOST -U $DB_USER -d $DB_NAME -t -A -F '|'" 2>/dev/null
}

# ----- find candidates -----

# Exclude rows whose id is already in the attempted log. Build a SQL `NOT IN`
# list inline; ~60k uuids ≈ 2.4 MB which Postgres accepts comfortably.
build_attempted_sql() {
  if [ ! -s "$PROGRESS_LOG" ]; then
    echo ""
    return
  fi
  local ids
  ids=$(awk -F, '{printf "'"'"'%s'"'"',", $1}' "$PROGRESS_LOG" | sed 's/,$//')
  if [ -z "$ids" ]; then
    echo ""
  else
    echo "AND p.id NOT IN ($ids)"
  fi
}

select_candidates() {
  local exclude
  exclude=$(build_attempted_sql)
  local limit_clause=""
  if [ "$MAX_RECORDS" -gt 0 ]; then
    limit_clause="LIMIT $MAX_RECORDS"
  fi
  psql_exec "
    SELECT p.id, p.\"phonesPrimaryPhoneNumber\"
    FROM ${WORKSPACE_SCHEMA}.person p
    WHERE (p.\"nameFirstName\" IS NULL OR p.\"nameFirstName\" = '')
      AND (p.\"nameLastName\" IS NULL OR p.\"nameLastName\" = '')
      AND p.\"phonesPrimaryPhoneNumber\" IS NOT NULL
      AND p.\"phonesPrimaryPhoneNumber\" <> ''
      AND p.\"createdBySource\" = 'MANUAL'
      AND p.\"createdAt\" >= '2026-05-08'
      AND p.\"deletedAt\" IS NULL
      $exclude
    ORDER BY random()
    $limit_clause
  "
}

# ----- Convoso lookup -----

# Returns JSON with first_name/last_name/email/address fields if a lead with
# a name is found for this phone; else returns empty string.
lookup_lead_by_phone() {
  local phone="$1"
  curl -sS --max-time 15 \
    "${CONVOSO_API_BASE}/leads/search?auth_token=${TOKEN}&phone_number=${phone}&offset=0&limit=10" \
    > /tmp/enrich-lead.json 2>/dev/null

  # Pick the first entry that has a non-empty first_name OR last_name.
  jq -c '
    .data.entries // .data // .entries // []
    | (if type == "array" then . else [.] end)
    | map(select((.first_name // "") != "" or (.last_name // "") != ""))
    | .[0] // empty
    | {first_name: (.first_name // ""), last_name: (.last_name // ""),
       email: (.email // ""), address1: (.address1 // ""), city: (.city // ""),
       state: (.state // ""), postal_code: (.postal_code // ""), country: (.country // "")}
  ' /tmp/enrich-lead.json 2>/dev/null
}

# ----- update Person -----

# Escape single quotes for SQL literal injection
sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

update_person() {
  local pid="$1"
  local lead_json="$2"

  local fn ln em addr1 city state postal country
  fn=$(echo "$lead_json"  | jq -r '.first_name')
  ln=$(echo "$lead_json"  | jq -r '.last_name')
  em=$(echo "$lead_json"  | jq -r '.email')
  addr1=$(echo "$lead_json" | jq -r '.address1')
  city=$(echo "$lead_json"  | jq -r '.city')
  state=$(echo "$lead_json" | jq -r '.state')
  postal=$(echo "$lead_json" | jq -r '.postal_code')
  country=$(echo "$lead_json" | jq -r '.country')

  local set_parts=()
  [ -n "$fn" ]      && set_parts+=("\"nameFirstName\" = '$(sql_escape "$fn")'")
  [ -n "$ln" ]      && set_parts+=("\"nameLastName\" = '$(sql_escape "$ln")'")
  [ -n "$em" ]      && set_parts+=("\"emailsPrimaryEmail\" = '$(sql_escape "$em")'")
  [ -n "$addr1" ]   && set_parts+=("\"addressCustomAddressStreet1\" = '$(sql_escape "$addr1")'")
  [ -n "$city" ]    && set_parts+=("\"addressCustomAddressCity\" = '$(sql_escape "$city")'")
  [ -n "$state" ]   && set_parts+=("\"addressCustomAddressState\" = '$(sql_escape "$state")'")
  [ -n "$postal" ]  && set_parts+=("\"addressCustomAddressPostcode\" = '$(sql_escape "$postal")'")
  [ -n "$country" ] && set_parts+=("\"addressCustomAddressCountry\" = '$(sql_escape "$country")'")
  # updatedBySource is a strict enum; use SYSTEM (we're a system batch).
  # updatedByName is a free-text marker so we can identify these rows later.
  set_parts+=("\"updatedBySource\" = 'SYSTEM'")
  set_parts+=("\"updatedByName\" = 'convoso-enrichment'")
  set_parts+=("\"updatedAt\" = NOW()")

  local set_clause
  set_clause=$(IFS=', '; echo "${set_parts[*]}")

  psql_exec "UPDATE ${WORKSPACE_SCHEMA}.person SET $set_clause WHERE id = '$pid';" >/dev/null
}

# ----- main loop -----

echo "=== Convoso lead enrichment ==="
echo "Workers: $WORKERS"
echo "Rate target: $RATE_RPS req/s"
echo "Max records: ${MAX_RECORDS:-no cap}"
echo "Dry run: $DRY_RUN"
echo "Progress log: $PROGRESS_LOG"
echo ""

# Count empties before we start (full unattempted set, ignoring MAX cap).
total_remaining=$(psql_exec "
  SELECT COUNT(*) FROM ${WORKSPACE_SCHEMA}.person
  WHERE (\"nameFirstName\" IS NULL OR \"nameFirstName\" = '')
    AND (\"nameLastName\" IS NULL OR \"nameLastName\" = '')
    AND \"phonesPrimaryPhoneNumber\" IS NOT NULL AND \"phonesPrimaryPhoneNumber\" <> ''
    AND \"createdBySource\" = 'MANUAL'
    AND \"createdAt\" >= '2026-05-08'
    AND \"deletedAt\" IS NULL;
")
echo "Empty-shell Persons remaining (entire window): $total_remaining"
echo ""

CANDIDATES=$(select_candidates)
candidate_count=$(echo "$CANDIDATES" | grep -c '^' || true)
echo "Candidates this run: $candidate_count"
[ "$candidate_count" -eq 0 ] && { echo "Nothing to do."; exit 0; }

# Spacing between *new* job launches (per-worker effective rate ~= RATE_RPS / WORKERS).
sleep_between=$(awk "BEGIN { printf \"%.3f\", 1.0/$RATE_RPS }")
echo "Spacing between launches: ${sleep_between}s"
echo ""

# Worker function: processes one (pid, phone). Runs in a background subshell;
# inherits all helper functions from the parent shell.
process_one() {
  local pid="$1"
  local phone="$2"

  local lead_json
  lead_json=$(lookup_lead_by_phone "$phone")

  if [ -z "$lead_json" ]; then
    mark_attempted "$pid" "no_match"
    return
  fi

  if [ "$DRY_RUN" = "true" ]; then
    echo "DRY: $pid phone=$phone -> $(echo "$lead_json" | jq -c '{first_name, last_name, email}')"
    return
  fi

  if update_person "$pid" "$lead_json"; then
    mark_attempted "$pid" "enriched"
  else
    mark_attempted "$pid" "error"
  fi
}

processed=0
start_ts=$(date +%s)

# Snapshot baseline counts from the progress log so we can report per-run deltas.
base_enriched=$(grep -c ',enriched$' "$PROGRESS_LOG" 2>/dev/null; true)
base_no_match=$(grep -c ',no_match$' "$PROGRESS_LOG" 2>/dev/null; true)
base_errors=$(grep -c ',error$' "$PROGRESS_LOG" 2>/dev/null; true)

while IFS='|' read -r pid phone; do
  [ -z "$pid" ] && continue
  processed=$((processed+1))

  # Throttle to $WORKERS concurrent background jobs.
  while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$WORKERS" ]; do
    sleep 0.05
  done

  process_one "$pid" "$phone" &

  # Progress line every 50 launches (cheap; doesn't block workers).
  if [ $((processed % 50)) -eq 0 ]; then
    elapsed=$(( $(date +%s) - start_ts ))
    cur_enriched=$(grep -c ',enriched$' "$PROGRESS_LOG" 2>/dev/null; true)
    cur_no_match=$(grep -c ',no_match$' "$PROGRESS_LOG" 2>/dev/null; true)
    new_enriched=$((cur_enriched - base_enriched))
    new_no_match=$((cur_no_match - base_no_match))
    rate=$(awk "BEGIN { if ($elapsed > 0) printf \"%.1f\", $processed/$elapsed; else print \"0.0\" }")
    echo "[${elapsed}s] launched=$processed  enriched=$new_enriched  no_match=$new_no_match  (${rate} launch/s)"
  fi

  sleep "$sleep_between"
done <<< "$CANDIDATES"

# Drain remaining workers.
wait

elapsed=$(( $(date +%s) - start_ts ))
cur_enriched=$(grep -c ',enriched$' "$PROGRESS_LOG" 2>/dev/null; true)
cur_no_match=$(grep -c ',no_match$' "$PROGRESS_LOG" 2>/dev/null; true)
cur_errors=$(grep -c ',error$' "$PROGRESS_LOG" 2>/dev/null; true)

echo ""
echo "===== run summary ====="
echo "Launched:      $processed"
echo "Enriched (Δ):  $((cur_enriched - base_enriched))"
echo "No match (Δ):  $((cur_no_match - base_no_match))"
echo "Errors (Δ):    $((cur_errors - base_errors))"
echo "Duration:      ${elapsed}s"
echo ""
echo "Lifetime totals (across all runs):"
echo "  enriched: $cur_enriched"
echo "  no_match: $cur_no_match"
echo "  errors:   $cur_errors"
