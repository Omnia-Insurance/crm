#!/usr/bin/env python3
"""
Backfill submittedDate with full timestamps from old CRM's reg_date.

After the DATE→DATE_TIME migration, policies synced from the old CRM only have
midnight-Eastern timestamps. This script fetches the original reg_date (with
time) from the lead-report-api and updates each matching policy.

Usage:
  python3 scripts/backfill-submitted-datetime.py --dry-run   # Preview changes
  python3 scripts/backfill-submitted-datetime.py              # Apply changes
"""

import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

# === CONFIG ===
OLD_CRM_BASE = "https://omnia.geogrowth.com/api/orgadmin"
NEW_CRM_GQL = "https://crm.omniaagent.com/graphql"
NEW_CRM_TOKEN = open("/tmp/twenty-token.txt").read().strip()

NEW_HEADERS = {
    "Authorization": f"Bearer {NEW_CRM_TOKEN}",
    "Content-Type": "application/json",
}

DELAY = 0.02  # seconds between CRM writes
WORKERS = 10  # parallel page fetchers


def eastern_to_utc_iso(reg_date_str):
    """Convert 'YYYY-MM-DD HH:MM:SS' Eastern -> UTC ISO string."""
    trimmed = reg_date_str.strip()
    if len(trimmed) <= 10:
        trimmed += " 00:00:00"
    naive = datetime.strptime(trimmed[:19], "%Y-%m-%d %H:%M:%S")
    eastern = naive.replace(tzinfo=ZoneInfo("America/New_York"))
    utc = eastern.astimezone(ZoneInfo("UTC"))
    return utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def gql(query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    resp = requests.post(NEW_CRM_GQL, headers=NEW_HEADERS, json=payload, timeout=30)
    time.sleep(DELAY)
    data = resp.json()
    if "errors" in data:
        return None, data["errors"]
    return data.get("data"), None


def fetch_old_crm_page(page):
    """Fetch one page from the old CRM lead-report-api."""
    resp = requests.get(
        f"{OLD_CRM_BASE}/lead-report-api",
        params={"page": page, "per_page": 10},
        headers={"Accept": "application/json"},
        timeout=30,
    )
    if not resp.ok:
        return [], 0
    data = resp.json()
    response = data.get("response", {})
    policies = response.get("data", [])
    total_pages = response.get("total_page", 1)
    return policies, total_pages


def build_reg_date_lookup():
    """Fetch all pages from old CRM and build {policy_id: reg_date} lookup."""
    print("Fetching page 1 to get total page count...")
    policies, total_pages = fetch_old_crm_page(1)
    lookup = {}

    for p in policies:
        pid = str(p.get("policy_id", ""))
        reg = p.get("reg_date", "")
        if pid and reg and reg != "0000-00-00":
            lookup[pid] = reg

    print(f"  Total pages: {total_pages}")

    if total_pages <= 1:
        return lookup

    # Fetch remaining pages in parallel
    remaining = list(range(2, total_pages + 1))
    print(f"  Fetching pages 2-{total_pages} with {WORKERS} workers...")

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(fetch_old_crm_page, pg): pg for pg in remaining}
        done = 0
        for future in as_completed(futures):
            done += 1
            page_policies, _ = future.result()
            for p in page_policies:
                pid = str(p.get("policy_id", ""))
                reg = p.get("reg_date", "")
                if pid and reg and reg != "0000-00-00":
                    lookup[pid] = reg
            if done % 100 == 0:
                print(f"    {done}/{len(remaining)} pages fetched...")

    print(f"  Built lookup with {len(lookup)} policies")
    return lookup


def fetch_crm_policies_with_old_id():
    """Fetch all CRM policies that have an oldCrmPolicyId set."""
    print("Fetching CRM policies with oldCrmPolicyId...")
    results = []
    cursor = None

    while True:
        after = f', after: "{cursor}"' if cursor else ""
        data, err = gql(f"""
            query {{
                policies(
                    filter: {{ oldCrmPolicyId: {{ is: NOT_NULL }} }}
                    first: 500{after}
                ) {{
                    pageInfo {{ hasNextPage endCursor }}
                    edges {{ node {{ id oldCrmPolicyId submittedDate }} }}
                }}
            }}
        """)
        if not data:
            print(f"  Error fetching policies: {err}")
            break
        result = data["policies"]
        for edge in result["edges"]:
            results.append(edge["node"])
        if not result["pageInfo"]["hasNextPage"]:
            break
        cursor = result["pageInfo"]["endCursor"]

    print(f"  Found {len(results)} policies with oldCrmPolicyId")
    return results


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("BACKFILL: submittedDate DATE_TIME from old CRM reg_date")
    if dry_run:
        print("  *** DRY RUN — no updates will be made ***")
    print("=" * 60)

    # Step 1: Build lookup from old CRM
    reg_date_lookup = build_reg_date_lookup()

    # Step 2: Fetch CRM policies with old CRM IDs
    crm_policies = fetch_crm_policies_with_old_id()

    # Step 3: Update each matching policy
    updated = 0
    skipped_no_match = 0
    skipped_same = 0
    failed = 0

    for policy in crm_policies:
        old_id = policy["oldCrmPolicyId"]
        reg_date = reg_date_lookup.get(old_id)

        if not reg_date:
            skipped_no_match += 1
            continue

        utc_iso = eastern_to_utc_iso(reg_date)

        # Skip if already correct (avoid unnecessary writes)
        existing = policy.get("submittedDate", "")
        if existing and existing.startswith(utc_iso[:19]):
            skipped_same += 1
            continue

        if dry_run:
            print(f"  [DRY RUN] Policy {policy['id']} (old={old_id}): "
                  f"reg_date={reg_date} -> {utc_iso}")
            updated += 1
            continue

        data, err = gql("""
            mutation($id: ID!, $input: PolicyUpdateInput!) {
                updatePolicy(id: $id, data: $input) { id }
            }
        """, {"id": policy["id"], "input": {"submittedDate": utc_iso}})

        if data:
            updated += 1
        else:
            failed += 1
            if failed <= 20:
                err_msg = err[0]["message"] if err else "unknown"
                print(f"  FAIL {policy['id']}: {err_msg[:150]}")

        if updated % 100 == 0 and updated > 0:
            print(f"  Progress: {updated} updated...")

    print("\n" + "=" * 60)
    print("BACKFILL COMPLETE" + (" (DRY RUN)" if dry_run else ""))
    print("=" * 60)
    print(f"  Updated:        {updated}")
    print(f"  No match:       {skipped_no_match} (old CRM ID not in lookup)")
    print(f"  Already correct: {skipped_same}")
    print(f"  Failed:         {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
