#!/usr/bin/env python3
"""
Create the Convoso Call Ingestion pipeline in pull mode via the metadata GraphQL API.

Usage:
  python3 scripts/create-convoso-call-pipeline-api.py --url https://staging-crm.omniaagent.com --token <api-token>
"""

import argparse
import json
import sys
import urllib.request


def graphql_request(base_url, token, query, variables=None):
    url = f"{base_url}/metadata"
    data = {"query": query}
    if variables:
        data["variables"] = variables
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "TwentyCRM-Script/1.0",
    }
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"HTTP {e.code}: {error_body}")
        sys.exit(1)

    if "errors" in result:
        print(f"GraphQL errors: {json.dumps(result['errors'], indent=2)}")
        sys.exit(1)

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Create Convoso Call pull pipeline via API"
    )
    parser.add_argument("--url", required=True, help="Base URL")
    parser.add_argument("--token", required=True, help="API token")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    token = args.token

    # Step 1: Create the pipeline
    print("Creating Convoso Call Ingestion pipeline (pull mode)...")

    create_pipeline_mutation = """
    mutation CreateIngestionPipeline($input: CreateIngestionPipelineInput!) {
      createIngestionPipeline(input: $input) {
        id
        name
        mode
        schedule
      }
    }
    """

    pipeline_input = {
        "input": {
            "name": "Convoso Call Ingestion",
            "mode": "pull",
            "targetObjectNameSingular": "call",
            "sourceUrl": "https://api.convoso.com/v1/log/retrieve",
            "sourceAuthConfig": {
                "type": "query_param",
                "paramName": "auth_token",
                "envVar": "CONVOSO_API_TOKEN",
            },
            "sourceRequestConfig": {
                "queryParams": {"include_recordings": "0"},
                "dateRangeParams": {
                    "startParam": "start_time",
                    "endParam": "end_time",
                    "lookbackMinutes": 120,
                    "timezone": "America/Los_Angeles",
                },
            },
            "responseRecordsPath": "data.results",
            "paginationConfig": {
                "type": "offset",
                "paramName": "offset",
                "pageSize": 500,
            },
            "schedule": "*/5 * * * *",
            "dedupFieldName": "convosoCallId",
            "isEnabled": True,
        }
    }

    result = graphql_request(
        base_url, token, create_pipeline_mutation, pipeline_input
    )
    pipeline = result["data"]["createIngestionPipeline"]
    pipeline_id = pipeline["id"]
    print(f"  Created pipeline: {pipeline['name']} (id={pipeline_id})")
    print(f"  Mode: {pipeline['mode']}, Schedule: {pipeline['schedule']}")

    # Step 2: Create all 15 field mappings
    print("Creating field mappings...")

    create_mappings_mutation = """
    mutation CreateIngestionFieldMappings($inputs: [CreateIngestionFieldMappingInput!]!) {
      createIngestionFieldMappings(inputs: $inputs) {
        id
        sourceFieldPath
        targetFieldName
        position
      }
    }
    """

    mappings = [
        # 1. id -> convosoCallId (pull API uses `id`, push uses `uniqueid`)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "id",
            "targetFieldName": "convosoCallId",
            "position": 0,
        },
        # 2. lead_id -> convosoLeadId (sanitizeNull)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "lead_id",
            "targetFieldName": "convosoLeadId",
            "transform": {"type": "sanitizeNull"},
            "position": 1,
        },
        # 3. call_date -> callDate (dateFormat ISO)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "call_date",
            "targetFieldName": "callDate",
            "transform": {"type": "dateFormat", "sourceFormat": "ISO"},
            "position": 2,
        },
        # 4. call_length -> duration (numberScale x1)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "call_length",
            "targetFieldName": "duration",
            "transform": {"type": "numberScale", "multiplier": 1},
            "position": 3,
        },
        # 5. status -> status (sanitizeNull)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "status",
            "targetFieldName": "status",
            "transform": {"type": "sanitizeNull"},
            "position": 4,
        },
        # 6. status_name -> statusName (sanitizeNull)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "status_name",
            "targetFieldName": "statusName",
            "transform": {"type": "sanitizeNull"},
            "position": 5,
        },
        # 7. queue -> queueName (pull API uses `queue`, push uses `queue_name`)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "queue",
            "targetFieldName": "queueName",
            "transform": {"type": "sanitizeNull"},
            "position": 6,
        },
        # 8. _direction -> direction (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_direction",
            "targetFieldName": "direction",
            "position": 7,
        },
        # 9. _name -> name (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_name",
            "targetFieldName": "name",
            "position": 8,
        },
        # 10. _personId -> leadId (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_personId",
            "targetFieldName": "leadId",
            "position": 9,
        },
        # 11. _leadSourceId -> leadSourceId (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_leadSourceId",
            "targetFieldName": "leadSourceId",
            "position": 10,
        },
        # 12. _billable -> billable (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_billable",
            "targetFieldName": "billable",
            "position": 11,
        },
        # 13. _costAmountMicros -> cost.amountMicros (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_costAmountMicros",
            "targetFieldName": "cost",
            "targetCompositeSubField": "amountMicros",
            "position": 12,
        },
        # 14. _costCurrencyCode -> cost.currencyCode (from preprocessor)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "_costCurrencyCode",
            "targetFieldName": "cost",
            "targetCompositeSubField": "currencyCode",
            "position": 13,
        },
        # 15. user_id -> agentId (relation via agentProfile.convosoUserId)
        {
            "pipelineId": pipeline_id,
            "sourceFieldPath": "user_id",
            "targetFieldName": "agentId",
            "relationTargetObjectName": "agentProfile",
            "relationMatchFieldName": "convosoUserId",
            "relationAutoCreate": False,
            "position": 14,
        },
    ]

    result = graphql_request(
        base_url, token, create_mappings_mutation, {"inputs": mappings}
    )
    created = result["data"]["createIngestionFieldMappings"]
    print(f"  Created {len(created)} field mappings")

    for m in created:
        print(f"    {m['position']:>2}. {m['sourceFieldPath']} -> {m['targetFieldName']}")

    print(f"\nDone! Pipeline ID: {pipeline_id}")
    print("The pull scheduler will start polling every 5 minutes.")
    print("To trigger a manual pull, use the triggerIngestionPull mutation.")


if __name__ == "__main__":
    main()
