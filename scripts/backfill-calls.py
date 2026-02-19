#!/usr/bin/env python3
"""
Backfill calls from Convoso via the ingestion pipeline.

This script temporarily widens the pipeline's lookback window to cover
the target date range, then triggers a pull through the full ingestion
pipeline (preprocessor -> field mappings -> record processor -> dedup).

Usage:
  python3 scripts/backfill-calls.py \
    --url https://staging-crm.omniaagent.com \
    --token <api-token> \
    --date 2026-02-18

  # Or a range:
  python3 scripts/backfill-calls.py \
    --url https://staging-crm.omniaagent.com \
    --token <api-token> \
    --start 2026-02-17 --end 2026-02-19
"""

import argparse
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timezone

DEFAULT_PIPELINE_ID = "716afad6-a45a-4bdd-b8a4-0e64ed466bf8"


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


def update_lookback(base_url, token, pipeline_id, lookback_minutes, config):
    """Update the pipeline's lookback while preserving other config."""
    new_config = dict(config)
    new_config["dateRangeParams"] = dict(config.get("dateRangeParams", {}))
    new_config["dateRangeParams"]["lookbackMinutes"] = lookback_minutes

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
                "sourceRequestConfig": new_config,
            },
        }
    })

    if "errors" in result:
        print(f"Error updating lookback: {json.dumps(result['errors'], indent=2)}")
        sys.exit(1)

    return result["data"]["updateIngestionPipeline"]["sourceRequestConfig"]


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


def poll_completion(base_url, token, pipeline_id, timeout_seconds=300):
    start = time.time()
    while time.time() - start < timeout_seconds:
        time.sleep(5)
        result = meta_gql(base_url, token, """
        {
          ingestionLogs(pipelineId: "%s", limit: 1) {
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

        latest = logs[0]
        elapsed = int(time.time() - start)
        print(f"  [{elapsed}s] {latest['status']} | "
              f"received={latest.get('totalRecordsReceived', '?')} "
              f"created={latest.get('recordsCreated', '?')} "
              f"updated={latest.get('recordsUpdated', '?')} "
              f"failed={latest.get('recordsFailed', '?')}")

        if latest["status"] in ("completed", "failed"):
            if latest.get("errors"):
                print(f"  Errors: {latest['errors']}")
            return latest

    print("Timed out waiting for pull to complete")
    return None


def main():
    parser = argparse.ArgumentParser(description="Backfill calls via ingestion pipeline")
    parser.add_argument("--url", required=True, help="Base URL (e.g. https://staging-crm.omniaagent.com)")
    parser.add_argument("--token", required=True, help="API token")
    parser.add_argument("--date", help="Single date to backfill (YYYY-MM-DD)")
    parser.add_argument("--start", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", help="End date (YYYY-MM-DD), defaults to now")
    parser.add_argument("--pipeline-id", default=DEFAULT_PIPELINE_ID, help="Pipeline ID")
    args = parser.parse_args()

    pipeline_id = args.pipeline_id
    base_url = args.url.rstrip("/")
    token = args.token

    # Determine date range
    if args.date:
        start_date = datetime.strptime(args.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_date = datetime.strptime(args.date, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    elif args.start:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if args.end:
            end_date = datetime.strptime(args.end, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc
            )
        else:
            end_date = datetime.now(timezone.utc)
    else:
        print("Error: specify --date or --start")
        sys.exit(1)

    # Calculate lookback minutes from start_date to now
    now = datetime.now(timezone.utc)
    lookback_minutes = math.ceil((now - start_date).total_seconds() / 60)
    # Add 8 hours buffer for timezone (LA is UTC-8)
    lookback_minutes += 480

    print(f"Backfill range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d %H:%M')}")
    print(f"Lookback: {lookback_minutes} minutes ({lookback_minutes / 60:.1f} hours)")

    # Step 1: Save original config
    print("\nSaving original pipeline config...")
    original_config = get_pipeline_config(base_url, token, pipeline_id)
    original_lookback = original_config.get("dateRangeParams", {}).get("lookbackMinutes", 120)
    print(f"  Original lookback: {original_lookback} minutes")

    # Step 2: Widen lookback for backfill
    print(f"\nUpdating lookback to {lookback_minutes} minutes...")
    updated = update_lookback(base_url, token, pipeline_id, lookback_minutes, original_config)
    print(f"  Updated: {json.dumps(updated.get('dateRangeParams', {}))}")

    # Step 3: Trigger the pull (goes through full pipeline)
    print("\nTriggering pull ingestion...")
    log = trigger_pull(base_url, token, pipeline_id)
    print(f"  Log ID: {log['id']}, Status: {log['status']}")

    # Step 4: Wait for completion
    print("\nWaiting for pull to complete...")
    result = poll_completion(base_url, token, pipeline_id, timeout_seconds=600)

    # Step 5: Restore original lookback
    print(f"\nRestoring original lookback ({original_lookback} minutes)...")
    update_lookback(base_url, token, pipeline_id, original_lookback, original_config)
    print("  Restored.")

    # Summary
    if result and result["status"] == "completed":
        print(f"\n{'='*60}")
        print("BACKFILL COMPLETE")
        print(f"  Records received: {result.get('totalRecordsReceived', '?')}")
        print(f"  Created: {result.get('recordsCreated', '?')}")
        print(f"  Updated: {result.get('recordsUpdated', '?')}")
        print(f"  Failed:  {result.get('recordsFailed', '?')}")
        print(f"{'='*60}")
    elif result:
        print(f"\nBackfill FAILED: {result.get('errors', 'Unknown error')}")
    else:
        print("\nBackfill timed out -- check ingestion logs in the CRM")


if __name__ == "__main__":
    main()
