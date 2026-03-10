#!/usr/bin/env python3
"""
Backfill calls from Convoso via the ingestion pipeline.

This script iterates through a date range one day at a time, setting
explicit startTimeOverride/endTimeOverride on the pipeline config and
triggering a pull for each day. Each day goes through the full pipeline
path (fetch -> preprocessor -> field mappings -> record processor -> dedup).

Usage:
  # Single day
  python3 scripts/backfill-calls.py \
    --url https://staging-crm.omniaagent.com \
    --token <api-token> \
    --date 2026-02-18

  # Full historical backfill
  python3 scripts/backfill-calls.py \
    --url https://staging-crm.omniaagent.com \
    --token <api-token> \
    --start 2025-06-13 --end 2026-02-19

  # Resume interrupted backfill
  python3 scripts/backfill-calls.py \
    --url https://staging-crm.omniaagent.com \
    --token <api-token> \
    --start 2025-06-13 --end 2026-02-19 --resume

  # Dry run (print plan without executing)
  python3 scripts/backfill-calls.py \
    --url https://staging-crm.omniaagent.com \
    --token <api-token> \
    --start 2025-06-13 --end 2026-02-19 --dry-run
"""

import argparse
import json
import signal
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

DEFAULT_PIPELINE_NAME = "Convoso Call Ingestion"
PROGRESS_FILE = "backfill-progress.json"
POLL_INTERVAL_SECONDS = 5
DAY_TIMEOUT_SECONDS = 600
LOG_LOOKBACK_LIMIT = 50
LOG_MATCH_SKEW_SECONDS = 15


def meta_gql(base_url, token, query, variables=None):
    url = f"{base_url}/metadata"
    data = {"query": query}
    if variables:
        data["variables"] = variables
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "TwentyCRM-Script/1.0",
    }, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"HTTP {e.code}: {error_body[:500]}")
        sys.exit(1)


def require_gql_data(result, context):
    if "errors" in result and result["errors"]:
        print(f"Error {context}: {json.dumps(result['errors'], indent=2)}")
        sys.exit(1)

    data = result.get("data")
    if data is None:
        print(f"Error {context}: metadata API returned no data")
        print(json.dumps(result, indent=2))
        sys.exit(1)

    return data


def list_pipelines(base_url, token):
    data = require_gql_data(meta_gql(base_url, token, """
    {
      ingestionPipelines {
        id
        name
        mode
        targetObjectNameSingular
        isEnabled
      }
    }
    """), "listing ingestion pipelines")

    return data.get("ingestionPipelines") or []


def print_available_pipelines(pipelines):
    if not pipelines:
        print("  No ingestion pipelines were returned for this workspace/token.")
        return

    print("  Available ingestion pipelines:")
    for pipeline in pipelines:
        status = "enabled" if pipeline.get("isEnabled") else "disabled"
        print(
            f"    {pipeline['id']} | {pipeline['name']} | "
            f"{pipeline['mode']} -> {pipeline['targetObjectNameSingular']} | {status}"
        )


def resolve_pipeline(base_url, token, requested_pipeline_id):
    pipelines = list_pipelines(base_url, token)

    if requested_pipeline_id:
        for pipeline in pipelines:
            if pipeline["id"] == requested_pipeline_id:
                return pipeline

        print(f"Pipeline {requested_pipeline_id} not found or not accessible.")
        print_available_pipelines(pipelines)
        sys.exit(1)

    exact_name_matches = [
        pipeline
        for pipeline in pipelines
        if pipeline.get("name") == DEFAULT_PIPELINE_NAME
    ]
    if len(exact_name_matches) == 1:
        return exact_name_matches[0]

    call_candidates = [
        pipeline
        for pipeline in pipelines
        if pipeline.get("mode") == "pull"
        and pipeline.get("targetObjectNameSingular") == "call"
    ]
    if len(call_candidates) == 1:
        return call_candidates[0]

    if len(call_candidates) > 1:
        print(
            "Multiple pull pipelines targeting calls were found. "
            "Pass --pipeline-id explicitly."
        )
    else:
        print(
            f"Could not auto-discover the {DEFAULT_PIPELINE_NAME!r} pipeline. "
            "Pass --pipeline-id explicitly."
        )

    print_available_pipelines(pipelines)
    sys.exit(1)


def get_pipeline_config(base_url, token, pipeline_id):
    data = require_gql_data(meta_gql(base_url, token, """
    {
      ingestionPipeline(id: "%s") {
        id
        sourceRequestConfig
      }
    }
    """ % pipeline_id), f"fetching pipeline {pipeline_id}")

    pipeline = data.get("ingestionPipeline")
    if pipeline is None:
        print(f"Pipeline {pipeline_id} was not returned by the metadata API.")
        print("This usually means the pipeline id is stale for this workspace.")
        print_available_pipelines(list_pipelines(base_url, token))
        sys.exit(1)

    return pipeline.get("sourceRequestConfig") or {}


def update_pipeline_config(base_url, token, pipeline_id, config):
    """Update the full sourceRequestConfig."""
    data = require_gql_data(meta_gql(base_url, token, """
    mutation UpdateIngestionPipeline($input: UpdateIngestionPipelineInput!) {
      updateIngestionPipeline(input: $input) {
        id
        sourceRequestConfig
      }
    }
    """, {
        "input": {
            "id": pipeline_id,
            "update": {
                "sourceRequestConfig": config,
            },
        }
    }), f"updating pipeline {pipeline_id}")

    pipeline = data.get("updateIngestionPipeline")
    if pipeline is None:
        print(f"Pipeline {pipeline_id} was not updated by the metadata API.")
        sys.exit(1)

    return pipeline.get("sourceRequestConfig") or {}


def set_date_overrides(base_url, token, pipeline_id, config, start_time, end_time):
    """Set startTimeOverride and endTimeOverride on the pipeline config."""
    new_config = json.loads(json.dumps(config))
    if "dateRangeParams" not in new_config:
        new_config["dateRangeParams"] = {}
    new_config["dateRangeParams"]["startTimeOverride"] = start_time
    new_config["dateRangeParams"]["endTimeOverride"] = end_time
    return update_pipeline_config(base_url, token, pipeline_id, new_config)


def clear_date_overrides(base_url, token, pipeline_id, original_config):
    """Restore the original config (without overrides)."""
    return update_pipeline_config(base_url, token, pipeline_id, original_config)


def strip_date_overrides(config):
    cleaned = json.loads(json.dumps(config))
    date_range_params = cleaned.get("dateRangeParams")

    if not isinstance(date_range_params, dict):
        return cleaned, False

    removed = False
    for key in ("startTimeOverride", "endTimeOverride"):
        if key in date_range_params:
            del date_range_params[key]
            removed = True

    if not date_range_params:
        cleaned.pop("dateRangeParams", None)

    return cleaned, removed


def list_ingestion_logs(base_url, token, pipeline_id, limit=LOG_LOOKBACK_LIMIT):
    data = require_gql_data(meta_gql(base_url, token, """
    {
      ingestionLogs(pipelineId: "%s", limit: %d) {
        id
        status
        triggerType
        totalRecordsReceived
        recordsCreated
        recordsUpdated
        recordsFailed
        errors
        startedAt
        completedAt
      }
    }
    """ % (pipeline_id, limit)), f"listing ingestion logs for pipeline {pipeline_id}")

    return data.get("ingestionLogs") or []


def trigger_pull(base_url, token, pipeline_id):
    data = require_gql_data(meta_gql(base_url, token, """
    mutation {
      triggerIngestionPull(pipelineId: "%s") {
        id
        status
      }
    }
    """ % pipeline_id), f"triggering pull for pipeline {pipeline_id}")

    log = data.get("triggerIngestionPull")
    if log is None:
        print(f"Pipeline {pipeline_id} did not return an ingestion log when triggered.")
        sys.exit(1)

    return log


def parse_timestamp(value):
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def select_backfill_log(logs, known_log_ids, watch_started_at):
    threshold = watch_started_at - timedelta(seconds=LOG_MATCH_SKEW_SECONDS)
    new_logs = []

    for log in logs:
        if log.get("triggerType") != "pull":
            continue

        started_at = parse_timestamp(log.get("startedAt"))
        is_new_id = log.get("id") not in known_log_ids
        is_recent = started_at is not None and started_at >= threshold

        if is_new_id or is_recent:
            new_logs.append(log)

    # The placeholder log created by the GraphQL mutation stays pending.
    # Prefer the worker-owned log that actually transitions to running/completed.
    actionable_logs = [
        log for log in new_logs
        if log.get("status") in ("running", "completed", "failed", "partial")
    ]
    if actionable_logs:
        return actionable_logs[0]

    return None


def poll_completion(
    base_url,
    token,
    pipeline_id,
    known_log_ids,
    watch_started_at,
    timeout_seconds=DAY_TIMEOUT_SECONDS,
):
    """Poll for the worker-owned pull log created after the trigger."""
    start = time.time()
    tracked_log_id = None

    while time.time() - start < timeout_seconds:
        time.sleep(POLL_INTERVAL_SECONDS)
        try:
            logs = list_ingestion_logs(base_url, token, pipeline_id)
        except SystemExit:
            continue

        if not logs:
            continue

        if tracked_log_id is not None:
            target_log = next(
                (log for log in logs if log.get("id") == tracked_log_id),
                None,
            )
        else:
            target_log = select_backfill_log(logs, known_log_ids, watch_started_at)
            if target_log is not None:
                tracked_log_id = target_log.get("id")

        elapsed = int(time.time() - start)

        if target_log is None:
            if elapsed % 30 == 0 and elapsed > 0:
                print(f"    [{elapsed}s] waiting for worker log...")
            continue

        if target_log["status"] in ("completed", "failed", "partial"):
            print(f"    [{elapsed}s] {target_log['status']} | "
                  f"received={target_log.get('totalRecordsReceived', '?')} "
                  f"created={target_log.get('recordsCreated', '?')} "
                  f"updated={target_log.get('recordsUpdated', '?')} "
                  f"failed={target_log.get('recordsFailed', '?')}")
            if target_log.get("errors"):
                print(f"    Errors: {target_log['errors']}")
            return target_log

        if elapsed % 30 == 0 and elapsed > 0:
            print(f"    [{elapsed}s] still {target_log['status']}...")

    print(f"    Timed out after {timeout_seconds}s")
    return None


def load_progress():
    try:
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def date_range(start, end):
    """Generate dates from start to end (exclusive of end)."""
    current = start
    while current < end:
        yield current
        current += timedelta(days=1)


def main():
    parser = argparse.ArgumentParser(description="Backfill calls via ingestion pipeline")
    parser.add_argument("--url", required=True, help="Base URL (e.g. https://staging-crm.omniaagent.com)")
    parser.add_argument("--token", required=True, help="API token")
    parser.add_argument("--date", help="Single date to backfill (YYYY-MM-DD)")
    parser.add_argument("--start", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", help="End date exclusive (YYYY-MM-DD), defaults to today")
    parser.add_argument(
        "--pipeline-id",
        help=(
            "Pipeline ID. If omitted, the script auto-discovers the "
            f"{DEFAULT_PIPELINE_NAME!r} pull pipeline for calls."
        ),
    )
    parser.add_argument("--resume", action="store_true", help="Resume from last completed day")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without executing")
    parser.add_argument("--timeout", type=int, default=DAY_TIMEOUT_SECONDS,
                        help=f"Timeout per day in seconds (default: {DAY_TIMEOUT_SECONDS})")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    token = args.token
    pipeline = resolve_pipeline(base_url, token, args.pipeline_id)
    pipeline_id = pipeline["id"]

    # Determine date range
    if args.date:
        start_date = datetime.strptime(args.date, "%Y-%m-%d").date()
        end_date = start_date + timedelta(days=1)
    elif args.start:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        if args.end:
            end_date = datetime.strptime(args.end, "%Y-%m-%d").date()
        else:
            end_date = datetime.now().date()
    else:
        print("Error: specify --date or --start")
        sys.exit(1)

    all_days = list(date_range(start_date, end_date))
    total_days = len(all_days)

    if total_days == 0:
        print("Error: no days in range")
        sys.exit(1)

    # Handle resume
    completed_days = set()
    progress = None
    if args.resume:
        progress = load_progress()
        if progress:
            completed_days = set(progress.get("completedDays", []))
            print(f"Resuming: {len(completed_days)} days already completed")
            if progress.get("lastCompletedDate"):
                print(f"  Last completed: {progress['lastCompletedDate']}")
        else:
            print("No progress file found, starting fresh")

    days_to_process = [d for d in all_days if d.isoformat() not in completed_days]

    print(f"\nBackfill plan:")
    print(f"  Date range: {start_date} to {end_date} ({total_days} days)")
    print(f"  Already completed: {total_days - len(days_to_process)}")
    print(f"  Days to process: {len(days_to_process)}")
    print(f"  Pipeline: {pipeline_id}")
    print(f"  Pipeline name: {pipeline['name']}")

    if args.dry_run:
        print(f"\nDry run -- would process these days:")
        for i, day in enumerate(days_to_process):
            day_num = all_days.index(day) + 1
            print(f"  [{day_num}/{total_days}] {day.isoformat()}")
        print(f"\nEstimated time: {len(days_to_process) * 1.5:.0f} - {len(days_to_process) * 2:.0f} minutes")
        return

    # Initialize progress tracking
    if progress is None:
        progress = {
            "pipelineId": pipeline_id,
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "completedDays": [],
            "lastCompletedDate": None,
            "totalRecordsProcessed": 0,
            "totalCreated": 0,
            "totalUpdated": 0,
            "totalFailed": 0,
        }

    # Save original config (for cleanup)
    print("\nSaving original pipeline config...")
    original_config = get_pipeline_config(base_url, token, pipeline_id)
    print(f"  Original dateRangeParams: {json.dumps(original_config.get('dateRangeParams', {}))}")
    restore_config, had_existing_overrides = strip_date_overrides(original_config)
    if had_existing_overrides:
        print("  Found existing start/end overrides. They will be cleared when the script restores the pipeline config.")

    # Signal handler for graceful shutdown
    interrupted = False

    def handle_signal(sig, frame):
        nonlocal interrupted
        interrupted = True
        print(f"\n\nInterrupted! Cleaning up...")

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Process each day
    try:
        for i, day in enumerate(days_to_process):
            if interrupted:
                break

            day_num = all_days.index(day) + 1
            day_str = day.isoformat()
            # LA timezone format: YYYY-MM-DDTHH:MM:SS
            start_time = f"{day_str}T00:00:00"
            end_time = f"{day_str}T23:59:59"

            print(f"\n[Day {day_num}/{total_days}] {day_str}")
            print(f"  Setting overrides: {start_time} -> {end_time}")

            # Set date overrides
            set_date_overrides(base_url, token, pipeline_id, restore_config, start_time, end_time)

            known_log_ids = {
                log.get("id")
                for log in list_ingestion_logs(base_url, token, pipeline_id)
                if log.get("id")
            }
            watch_started_at = datetime.now(timezone.utc)

            # Trigger pull
            log = trigger_pull(base_url, token, pipeline_id)
            log_id = log["id"]
            print(f"  Triggered pull, log={log_id}")

            # Poll for completion
            result = poll_completion(
                base_url,
                token,
                pipeline_id,
                known_log_ids,
                watch_started_at,
                timeout_seconds=args.timeout,
            )

            if result and result["status"] in ("completed", "partial"):
                received = result.get("totalRecordsReceived", 0) or 0
                created = result.get("recordsCreated", 0) or 0
                updated = result.get("recordsUpdated", 0) or 0
                failed = result.get("recordsFailed", 0) or 0

                progress["completedDays"].append(day_str)
                progress["lastCompletedDate"] = day_str
                progress["totalRecordsProcessed"] += received
                progress["totalCreated"] += created
                progress["totalUpdated"] += updated
                progress["totalFailed"] += failed
                save_progress(progress)

                done = len(progress["completedDays"])
                total_proc = progress["totalRecordsProcessed"]
                print(f"  Done: {received:,} received, {created:,} created, "
                      f"{updated:,} updated, {failed:,} failed "
                      f"(running total: {total_proc:,})")
                if result["status"] == "partial":
                    print("  WARNING: Day completed with partial failures.")
            elif result and result["status"] == "failed":
                print(f"  FAILED: {result.get('errors', 'Unknown error')}")
                print(f"  Stopping backfill. Resume with --resume to skip failed day.")
                # Still save progress so we can resume
                save_progress(progress)
                break
            else:
                print(f"  Timed out for {day_str}. Stopping.")
                save_progress(progress)
                break

    finally:
        # Always restore original config
        print(f"\nRestoring original pipeline config...")
        try:
            clear_date_overrides(base_url, token, pipeline_id, restore_config)
            print("  Restored.")
        except Exception as e:
            print(f"  WARNING: Failed to restore config: {e}")
            print(f"  Manual restore may be needed. Original config:")
            print(f"  {json.dumps(original_config, indent=2)}")

    # Final summary
    print(f"\n{'='*60}")
    print("BACKFILL SUMMARY")
    print(f"  Days completed: {len(progress['completedDays'])}/{total_days}")
    print(f"  Total records processed: {progress['totalRecordsProcessed']:,}")
    print(f"  Total created: {progress['totalCreated']:,}")
    print(f"  Total updated: {progress['totalUpdated']:,}")
    print(f"  Total failed: {progress['totalFailed']:,}")
    if progress.get("lastCompletedDate"):
        print(f"  Last completed date: {progress['lastCompletedDate']}")
    remaining = total_days - len(progress["completedDays"])
    if remaining > 0:
        print(f"  Remaining: {remaining} days (use --resume to continue)")
    print(f"  Progress file: {PROGRESS_FILE}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
