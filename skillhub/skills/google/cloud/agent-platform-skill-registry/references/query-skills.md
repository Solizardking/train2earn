# Skill Discovery

This document covers safe, read-only operations for finding and inspecting
skills as well as their revision histories in the Skill Registry.

## Search Skills (Retrieve)

Find skills using semantic search. For example, describe the task you want to
accomplish, such as "find skills to manage cloud resources".

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region where the skills are located.
- `<var translate="no">QUERY</var>`: The query string to find matching skills.

#### HTTP method and URL

```
GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills:retrieve?query=QUERY
```

#### `curl` command

```bash
curl -X GET \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills:retrieve?query=QUERY"
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

response = client.skills.retrieve(
    query="QUERY",
    config={"top_k": TOP_K},
)
for retrieved_skill in response.retrieved_skills:
    print(retrieved_skill.skill_name, retrieved_skill.description)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const response = await client.skills.retrieve({
  query: 'QUERY',
  config: {
    topK: TOP_K,
  },
});
for (const retrievedSkill of response.retrievedSkills || []) {
  console.log(retrievedSkill.skillName, retrievedSkill.description);
}
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py search \
  --query "test skill" \
  --top-k 5
```

#### Supported Flags

- `--query` (Required): The semantic query to find matching skills.
- `--top-k` (Optional): The maximum number of skills to return. Defaults to 5.

---

## List Skills

List all skills in the registry for the configured project and location.

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region of the skills you want to list.

#### HTTP method and URL

```
GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills
```

#### `curl` command

```bash
curl -X GET \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills"
```

#### Example output

```json
{
  "name": "projects/1234567890/locations/us-central1/skills/3456789012",
  "createTime": "2026-05-10T00:02:12.497720Z",
  "updateTime": "2026-05-10T00:02:19.064874Z",
  "displayName": "cymbal_skill",
  "description": "A skill for managing Cymbal projects.",
  "state": "ACTIVE"
}
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

pager = client.skills.list()
for skill in pager:
    print(skill.name, skill.display_name)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const pager = await client.skills.list();
for await (const skill of pager) {
  console.log(skill.name, skill.displayName);
}
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py list
```

#### Supported Flags

*(None)*

---

## Get Skill

Retrieve the metadata and payload of the latest revision of a skill.

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region where the skills are located.
- `<var translate="no">SKILL_ID</var>`: The ID of the skill to retrieve.

#### HTTP method and URL

```
GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID
```

#### `curl` command

```bash
curl -X GET \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID"
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

skill = client.skills.get(
    name="projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID"
)
print(skill)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const skill = await client.skills.get({
  name: 'projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID',
});
console.log(skill);
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py get --skill-id "my-skill"
```

#### Supported Flags

- `--skill-id` (Required): The unique identifier for the skill.

---

## List Revisions

Retrieve the revision history for a specific skill.

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region where the skills are located.
- `<var translate="no">SKILL_ID</var>`: The ID of the skill.

#### HTTP method and URL

```
GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID/revisions
```

#### `curl` command

```bash
curl -X GET \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID/revisions"
```

#### Example output

```json
{
  "skillRevisions": [
    {
      "name": "projects/1234567890/locations/us-central1/skills/cymbal_skill/revisions/4567890123",
      "createTime": "2026-05-10T00:02:12.497720Z",
      "updateTime": "2026-05-10T00:02:19.064874Z"
    }
  ]
}
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

response = client.skills.revisions.list(
    name="projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID"
)
for skill_revision in response.skill_revisions:
    print(skill_revision.name, skill_revision.create_time)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const response = await client.skills.revisions.list({
  name: 'projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID',
});
for (const revision of response.skillRevisions || []) {
  console.log(revision.name, revision.createTime);
}
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py list-revision --skill-id "my-skill"
```

#### Supported Flags

- `--skill-id` (Required): The unique identifier for the skill.

---

## Get Revision

Fetch details of a specific revision of a skill.

### REST

#### Request variables

- `<var translate="no">PROJECT_ID</var>`: Your Google Cloud project ID.
- `<var translate="no">LOCATION</var>`: The region of the skill.
- `<var translate="no">SKILL_ID</var>`: The ID of the skill.
- `<var translate="no">REVISION_ID</var>`: The ID of the specific revision to
  retrieve. This can be found in the `name` field returned by
  `ListSkillRevisions`. For example, if the `name` is
  `projects/1234567890/locations/us-central1/skills/cymbal-skill/revisions/4567890123`,
  the revision ID is `4567890123`.

#### HTTP method and URL

```
GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID/revisions/REVISION_ID
```

#### `curl` command

```bash
curl -X GET \
      -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
      "https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID/revisions/REVISION_ID"
```

### Python

```python
import agentplatform

client = agentplatform.Client(project="PROJECT_ID", location="LOCATION")

revision = client.skills.revisions.get(
    name="projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID/revisions/REVISION_ID"
)
print(revision)
```

### Node.js

```javascript
import { Client } from '@google-cloud/agentplatform';

const client = new Client({
  project: 'PROJECT_ID',
  location: 'LOCATION',
});

const revision = await client.skills.revisions.get({
  name: 'projects/PROJECT_ID/locations/LOCATION/skills/SKILL_ID/revisions/REVISION_ID',
});
console.log(revision);
```

### Using the Python script

```bash
python3 scripts/skill_registry_ops.py get-revision \
  --skill-id "my-skill" \
  --revision-id "test-revision-123"
```

#### Supported Flags

- `--skill-id` (Required): The unique identifier for the skill.
- `--revision-id` (Required): The specific revision ID to fetch (e.g., from
  `list-revision`).