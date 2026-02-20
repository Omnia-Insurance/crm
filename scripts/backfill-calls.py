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

DEFAULT_PIPELINE_ID = "716afad6-a45a-4bdd-b8a4-0e64ed466bf8"
PROGRESS_FILE = "backfill-progress.json"
POLL_INTERVAL_SECONDS = 5
DAY_TIMEOUT_SECONDS = 600


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


def get_pipeline_config(base_url, token, pipeline_id):
    result = meta_gql(base_url, token, """
    {
      ingestionPipeline(id: "%s") {
        id
        sourceRequestConfig
      }
    }
    """ % pipeline_id)
    return result["data"]["ingestionPipeline"]["sourceRequestConfig"]


def update_pipeline_config(base_url, token, pipeline_id, config):
    """Update the full sourceRequestConfig."""
    result = meta_gql(base_url, token, """
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
    })

    if "errors" in result:
        print(f"Error updating config: {json.dumps(result['errors'], indent=2)}")
        sys.exit(1)

    return result["data"]["updateIngestionPipeline"]["sourceRequestConfig"]


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


def trigger_pull(base_url, token, pipeline_id):
    result = meta_gql(base_url, token, """
    mutation {
      triggerIngestionPull(pipelineId: "%s") {
        id
        status
      }
    }
    """ % pipeline_id)

    if "errors" in result:
        print(f"Error triggering pull: {json.dumps(result['errors'], indent=2)}")
        sys.exit(1)

    return result["data"]["triggerIngestionPull"]


def poll_completion(base_url, token, pipeline_id, log_id, timeout_seconds=DAY_TIMEOUT_SECONDS):
    """Poll for the specific log entry to complete."""
    start = time.time()
    while time.time() - start < timeout_seconds:
        time.sleep(POLL_INTERVAL_SECONDS)
        result = meta_gql(base_url, token, """
        {
          ingestionLogs(pipelineId: "%s", limit: 5) {
            id status totalRecordsReceived recordsCreated
            recordsUpdated recordsFailed errors completedAt
          }
        }
        """ % pipeline_id)

        if "errors" in result:
            continue

        logs = result["data"]["ingestionLogs"]
        if not logs:
            continue

        # Find our specific log entry
        target_log = None
        for log in logs:
            if log["id"] == log_id:
                target_log = log
                break

        if target_log is None:
            # Log not found yet, check the latest
            target_log = logs[0]

        elapsed = int(time.time() - start)

        if target_log["status"] in ("completed", "failed"):
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
    parser.add_argument("--pipeline-id", default=DEFAULT_PIPELINE_ID, help="Pipeline ID")
    parser.add_argument("--resume", action="store_true", help="Resume from last completed day")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without executing")
    parser.add_argument("--timeout", type=int, default=DAY_TIMEOUT_SECONDS,
                        help=f"Timeout per day in seconds (default: {DAY_TIMEOUT_SECONDS})")
    args = parser.parse_args()

    pipeline_id = args.pipeline_id
    base_url = args.url.rstrip("/")
    token = args.token

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
            set_date_overrides(base_url, token, pipeline_id, original_config, start_time, end_time)

            # Trigger pull
            log = trigger_pull(base_url, token, pipeline_id)
            log_id = log["id"]
            print(f"  Triggered pull, log={log_id}")

            # Poll for completion
            result = poll_completion(base_url, token, pipeline_id, log_id, timeout_seconds=args.timeout)

            if result and result["status"] == "completed":
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
            clear_date_overrides(base_url, token, pipeline_id, original_config)
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
