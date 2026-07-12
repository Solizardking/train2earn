# Monitor Operations

This document covers how to monitor the status of Long-Running Operations
(LROs) returned by lifecycle management actions (CreateSkill, UpdateSkill,
DeleteSkill).

A long-running operation is an API pattern used for operations that can take a
significant amount of time to complete. Instead of waiting for the operation to
finish, the API returns an operation resource.

The response from these methods includes a `name` field, which contains the
operation ID. For example, a `name` might look like this:
`projects/PROJECT_NUMBER/locations/LOCATION/skills/SKILL_ID/operations/OPERATION_ID`.

To check the status and get details of a long-running operation, use the
`GetOperation` method with the extracted `OPERATION_ID`.

---

## Check Operation Status

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region where the operation is
  running. This must match the region used in your initial request.
- `<var translate="no">OPERATION_ID</var>`: The ID of the operation. Extract
  this from the `name` field returned by `CreateSkill`, `UpdateSkill`, or
  `DeleteSkill`.

#### HTTP method and URL

```
GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/operations/OPERATION_ID
```

#### `curl` command

```bash
curl -X GET \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/operations/OPERATION_ID"
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py monitor \
  --operation-id "projects/my-project/locations/us-central1/operations/123456789"
```

#### Supported Flags

- `--operation-id` (Required): The unique identifier or full resource name of
  the long-running operation returned from previous commands.