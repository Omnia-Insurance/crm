#!/usr/bin/env python3
"""
Add convosoListId field to Lead Source and backfill from Convoso lists.
Uses the Twenty metadata GraphQL API and workspace REST API.

Usage:
  python3 scripts/add-convoso-list-id-field.py --url https://staging-crm.omniaagent.com --token <your-api-token>

To get your API token:
  Settings > APIs & Webhooks > Create API Key
"""

import argparse
import json
import sys
import urllib.request

# Convoso list_id -> name mapping (from /v1/lists/search API)
CONVOSO_LISTS = {
    "10129": "Default List:Omnia Insurance G",
    "10133": "Unlisted Inbound Callers",
    "10135": "Agent Created Leads",
    "10137": "API Inserted Leads",
    "10145": "TEST LEADS",
    "10269": "OIG Upload AOR BOB 07082025",
    "10295": "Dental BOB 7.13.25",
    "10297": "OIG Upload AOR BOB 07142025",
    "10361": "AWL Dental Live Transfers",
    "10363": "General TFN - Google",
    "10373": "OIG Upload DMS 07182025",
    "10391": "Slate U65 Leads",
    "10429": "RateQuote U65 Search",
    "10431": "Intuit U65 Inbounds",
    "10781": "AWL Dental Non-Sale Callbacks",
    "10855": "OIG Upload DMS 09222025",
    "10857": "Google STMHI TX",
    "10859": "Google STMHI FL",
    "10861": "Google STMHI National",
    "10863": "Google ACA National",
    "10865": "Google ACA FL",
    "10867": "Google ACA TX",
    "11655": "Benepath U65 Income",
    "11753": "Test List to review",
    "11755": "Sold ACA for Auto Conversion",
    "11757": "Retention List",
}

# Reverse: name -> list_id
NAME_TO_LIST_ID = {v: k for k, v in CONVOSO_LISTS.items()}


def api_request(url, token, data=None, method="GET"):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"HTTP {e.code}: {error_body}")
        raise


def graphql_request(base_url, token, query, variables=None):
    url = f"{base_url}/metadata"
    data = {"query": query}
    if variables:
        data["variables"] = variables
    return api_request(url, token, data, method="POST")


def get_lead_source_object_id(base_url, token):
    """Find the objectMetadataId for Lead Source."""
    query = """
    query {
      objects(filter: { nameSingular: { eq: "leadSource" } }) {
        edges {
          node {
            id
            nameSingular
            fields {
              edges {
                node {
                  id
                  name
                  type
                }
              }
            }
          }
        }
      }
    }
    """
    result = graphql_request(base_url, token, query)
    edges = result.get("data", {}).get("objects", {}).get("edges", [])
    if not edges:
        print("ERROR: Lead Source object not found")
        sys.exit(1)

    node = edges[0]["node"]
    fields = {
        f["node"]["name"]: f["node"]
        for f in node["fields"]["edges"]
    }
    return node["id"], fields


def create_field(base_url, token, object_metadata_id):
    """Create the convosoListId field on Lead Source."""
    mutation = """
    mutation CreateOneField($input: CreateOneFieldMetadataInput!) {
      createOneField(input: $input) {
        id
        name
        label
        type
      }
    }
    """
    variables = {
        "input": {
            "field": {
                "objectMetadataId": object_metadata_id,
                "type": "TEXT",
                "name": "convosoListId",
                "label": "Convoso List ID",
                "description": "Convoso list_id for matching leads to their source",
                "icon": "IconList",
                "isNullable": True,
                "isLabelSyncedWithName": False,
            }
        }
    }
    result = graphql_request(base_url, token, mutation, variables)
    if "errors" in result:
        print(f"GraphQL errors: {json.dumps(result['errors'], indent=2)}")
        sys.exit(1)
    field = result["data"]["createOneField"]
    print(f"  Created field: {field['name']} ({field['type']}) id={field['id']}")
    return field["id"]


def get_lead_sources(base_url, token):
    """Fetch all Lead Source records via the workspace REST API."""
    url = f"{base_url}/api/objects/leadSources?limit=100"
    result = api_request(url, token)
    records = result.get("data", {}).get("leadSources", [])
    return records


def update_lead_source(base_url, token, record_id, convoso_list_id):
    """Update a Lead Source with its convosoListId."""
    url = f"{base_url}/api/objects/leadSources/{record_id}"
    data = {"convosoListId": convoso_list_id}
    api_request(url, token, data, method="PATCH")


def main():
    parser = argparse.ArgumentParser(
        description="Add convosoListId field to Lead Source and backfill"
    )
    parser.add_argument(
        "--url",
        required=True,
        help="Base URL (e.g. https://staging-crm.omniaagent.com)",
    )
    parser.add_argument("--token", required=True, help="API token (Bearer)")
    parser.add_argument(
        "--skip-create-field",
        action="store_true",
        help="Skip field creation (if already exists)",
    )
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    token = args.token

    # Step 1: Find Lead Source object and check if field exists
    print("Finding Lead Source object metadata...")
    object_id, existing_fields = get_lead_source_object_id(base_url, token)
    print(f"  objectMetadataId: {object_id}")
    print(f"  Existing fields: {', '.join(sorted(existing_fields.keys()))}")

    # Step 2: Create the field if it doesn't exist
    if "convosoListId" in existing_fields:
        print("  convosoListId field already exists, skipping creation")
    elif args.skip_create_field:
        print("  Skipping field creation (--skip-create-field)")
    else:
        print("Creating convosoListId field...")
        create_field(base_url, token, object_id)

    # Step 3: Fetch all Lead Sources
    print("Fetching Lead Source records...")
    lead_sources = get_lead_sources(base_url, token)
    print(f"  Found {len(lead_sources)} Lead Sources")

    # Step 4: Backfill by matching name
    updated = 0
    skipped = 0
    not_matched = []

    for ls in lead_sources:
        name = ls.get("name", "")
        existing_list_id = ls.get("convosoListId")
        record_id = ls["id"]

        if existing_list_id:
            skipped += 1
            continue

        convoso_list_id = NAME_TO_LIST_ID.get(name)
        if convoso_list_id:
            print(f"  Updating '{name}' -> convosoListId={convoso_list_id}")
            update_lead_source(base_url, token, record_id, convoso_list_id)
            updated += 1
        else:
            not_matched.append(name)

    print(f"\nDone! Updated: {updated}, Skipped (already set): {skipped}")
    if not_matched:
        print(f"Not matched ({len(not_matched)} Lead Sources without a Convoso list):")
        for name in not_matched:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
