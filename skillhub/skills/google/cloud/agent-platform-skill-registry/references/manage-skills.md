# Skill Lifecycle Management

This document covers state-changing actions (creating, updating, deleting) for a
skill. CreateSkill, UpdateSkill, and DeleteSkill are long-running operations
(LROs). See [monitor-operations.md](monitor-operations.md) to check their status.

---

## Create a skill

To create a new skill, use the `CreateSkill` method. This operation is a
long-running operation (LRO).

For examples of the expected skill structure, see the `SKILL.md` files in the
[Google Cloud Skills repository](https://github.com/google/skills/tree/main).

> **Note:** The zipped payload must meet specific size and content requirements
> for successful ingestion. For more information, see [Skill payload
> validation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/skill-registry#skill-payload-validation).

### Prepare payload (for REST API)

Before calling the REST API, package your skill files into a zipped archive and
encode it to a single-line base64 string:

1. Navigate to your skill directory:

   ```bash
   cd <SKILL_DIRECTORY>
   ```

2. Create the zip archive and encode it to base64:

   ```bash
   zip -r skill.zip scripts/ references/ SKILL.md assets/ && base64 -w 0 -i skill.zip
   ```

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region for your skill.
- `<var translate="no">SKILL_ID</var>`: The immutable skill ID (see ID constraints in SKILL.md).
- `<var translate="no">DISPLAY_NAME</var>`: The name of the skill used with the agent.
- `<var translate="no">DESCRIPTION</var>`: A description of what the skill does.
- `<var translate="no">BASE64_ZIPPED_BODY</var>`: The base64-encoded content of your zipped skill archive.

#### HTTP method and URL

```
POST https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills?skillId=SKILL_ID
```

#### Request JSON body

```json
{
  "displayName": "DISPLAY_NAME",
  "description": "DESCRIPTION",
  "zippedFilesystem": "BASE64_ZIPPED_BODY"
}
```

#### `curl` command

```bash
curl -X POST \
    -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
    -H "Content-Type: application/json" \
    -d '{
      "displayName": "DISPLAY_NAME",
      "description": "DESCRIPTION",
      "zippedFilesystem": "BASE64_ZIPPED_BODY"
    }' \
    "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills?skillId=SKILL_ID"
```

### Python (v1.154.0+)

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

skill = client.skills.create(
    skill_id="SKILL_ID",
    display_name="DISPLAY_NAME",
    description="DESCRIPTION",
    config={
        # Local directory path (automatically compressed) or pre-zipped path (.zip)
        "local_path": "SKILL_PATH",
    },
)
print(skill.name)
```

### Python (older than v1.154.0)

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

skill = client.skills.create(
    display_name="DISPLAY_NAME",
    description="DESCRIPTION",
    config={
        "skill_id": "SKILL_ID",
        # Local directory path (automatically compressed) or pre-zipped path (.zip)
        "local_path": "SKILL_PATH",
    },
)
print(skill.name)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const skill = await client.skills.create({
  skillId: 'SKILL_ID',
  displayName: 'DISPLAY_NAME',
  description: 'DESCRIPTION',
  config: {
    // Local directory path (automatically compressed) or pre-zipped path (.zip)
    localPath: 'SKILL_PATH',
  },
});
console.log(skill.name);
```

### Using the Python script

```bash
# Option 1: Upload a skill from a folder (recommended)
python3 scripts/skill_registry_ops.py upload \
  --skill-id "my-sample-skill" \
  --display-name "My Sample Skill" \
  --description "A test skill uploaded via script." \
  --folder "/path/to/skill/folder"

# Option 2: Upload a skill using a .zip file
python3 scripts/skill_registry_ops.py upload \
  --skill-id "my-sample-skill" \
  --display-name "My Sample Skill" \
  --description "A test skill uploaded via script." \
  --zip-file "/path/to/skill.zip"
```

> **Note:** This returns a long-running operation ID. See `monitor-operations.md`.

#### Supported Flags

- `--skill-id` (Required): The unique identifier for the skill.
- `--display-name` (Required): The human-readable name of the skill.
- `--description` (Required): A description of what the skill does.
- `--zip-file` (Required, mutually exclusive with `--folder`): Path to a local
  `.zip` file containing the skill.
- `--folder` (Required, mutually exclusive with `--zip-file`): Path to a local
  folder containing the skill.

---

## Update a skill

To update an existing skill, use the `UpdateSkill` method. You can update the
display name, description, and payload (zipped filesystem). Only the fields
listed in the `updateMask` query parameter get updated.

### Prepare payload (for REST API, optional)

If you are updating the skill's files, package your updated skill files:

1. Navigate to your skill directory:

   ```bash
   cd <SKILL_DIRECTORY>
   ```

2. Create the zip archive and encode it to base64:

   ```bash
   zip -r skill.zip scripts/ references/ SKILL.md assets/ && base64 -w 0 -i skill.zip
   ```

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region of the skill.
- `<var translate="no">SKILL_ID</var>`: The ID of the skill to update.
- `<var translate="no">DISPLAY_NAME</var>`: Optional. A new name for the skill.
- `<var translate="no">DESCRIPTION</var>`: Optional. A new description of what the skill does.
- `<var translate="no">BASE64_ZIPPED_BODY</var>`: Optional. The base64-encoded content of your updated zipped skill archive.

#### HTTP method and URL

```
PATCH https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID
```

#### Request JSON body

```json
{
  "displayName": "DISPLAY_NAME",
  "description": "DESCRIPTION",
  "zippedFilesystem": "BASE64_ZIPPED_BODY"
}
```

#### `curl` command

The following `curl` command updates the display name, description, and zipped
skill file.

```bash
curl -X PATCH \
    -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d '{
      "displayName": "DISPLAY_NAME",
      "description": "DESCRIPTION",
      "zippedFilesystem": "BASE64_ZIPPED_BODY"
    }' \
    "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID?updateMask=displayName,description,zippedFilesystem"
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

skill = client.skills.update(
    name="projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID",
    config={
        "display_name": "DISPLAY_NAME",
        "description": "DESCRIPTION",
        # Optional. Local directory path (automatically compressed) or pre-zipped path (.zip)
        "local_path": "SKILL_PATH",
    },
)
print(skill.name)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const skill = await client.skills.update({
  name: 'projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID',
  config: {
    displayName: 'DISPLAY_NAME',
    description: 'DESCRIPTION',
    // Optional. Local directory path (automatically compressed) or pre-zipped path (.zip)
    localPath: 'SKILL_PATH',
  },
});
console.log(skill.name);
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py update \
  --skill-id "my-sample-skill" \
  --display-name "Updated Name" \
  --description "Updated description." \
  --folder "/path/to/updated/skill/folder"
```

> **Note:** This returns a long-running operation ID. See `monitor-operations.md`.

#### Supported Flags

- `--skill-id` (Required): The unique identifier for the skill.
- `--display-name` (Optional): A new display name for the skill.
- `--description` (Optional): A new description for the skill.
- `--zip-file` (Optional, Mutually exclusive with `--folder`): Path to a new
  `.zip` file payload.
- `--folder` (Optional, Mutually exclusive with `--zip-file`): Path to a new
  folder payload.

---

## Delete a skill

To delete a skill and all of its revisions, use the `DeleteSkill` method. This
operation is a long-running operation (LRO).

> **Note:** You cannot delete built-in skills that have IDs starting with `gcp-`.

> **Caution:** When you delete a skill, its `SKILL_ID` is reserved and cannot be
> reused for 24 hours.

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region where the skill is located.
- `<var translate="no">SKILL_ID</var>`: The ID of the skill to delete.

#### HTTP method and URL

```
DELETE https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID
```

#### `curl` command

```bash
curl -X DELETE \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID"
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

client.skills.delete(
    name="projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID"
)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

await client.skills.delete({
  name: 'projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID',
});
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py delete --skill-id "my-skill"
```

> **Note:** This returns a long-running operation ID. See `monitor-operations.md`.

#### Supported Flags

- `--skill-id` (Required): The unique identifier for the skill to delete.