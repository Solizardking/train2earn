---
name: agent-platform-skill-registry
metadata:
  category: AiAndMachineLearning
description: >
  Interact with the Gemini Enterprise Agent Platform Skill Registry to create,
  update, manage, and search for skills. Use this skill to enable agents to
  register new functionality, discover existing capabilities, manage skill
  revisions, and monitor long-running operations.
---

> [!WARNING]
> **Preview:** This feature is subject to the "Pre-GA Offerings Terms" in the
> General Service Terms section of the [Service Specific
> Terms](https://cloud.google.com/terms/service-terms#1). When you use this
> feature with AI Agents, the terms applicable to AI Agents in the Agreement
> apply. Pre-GA features are available "as is" and might have limited support.
> For more information, see the [launch stage
> descriptions](https://cloud.google.com/products#product-launch-stages).

> [!NOTE]
> To see an example of creating and managing skills in Skill Registry, run the
> "Intro to Skill Registry" notebook in one of the following environments:
>
> [![](https://docs.cloud.google.com/static/vertex-ai/images/colab-logo-32px.png)Open in Colab](https://colab.research.google.com/github/GoogleCloudPlatform/generative-ai/blob/main/agents/skill-registry/intro_skill_registry.ipynb)
>
> [![](https://docs.cloud.google.com/static/vertex-ai/images/colab-enterprise-logo-32px.png)Open in Colab Enterprise](https://console.cloud.google.com/agent-platform/colab/import/https%3A%2F%2Fraw.githubusercontent.com%2FGoogleCloudPlatform%2Fgenerative-ai%2Fmain%2Fagents%2Fskill-registry%2Fintro_skill_registry.ipynb)
>
> [![](https://docs.cloud.google.com/static/vertex-ai/images/vertex-ai-workbench-logo-32px.png)Open in Agent Platform Workbench](https://console.cloud.google.com/agent-platform/workbench/deploy-notebook?download_url=https://raw.githubusercontent.com/GoogleCloudPlatform/generative-ai/main/agents/skill-registry/intro_skill_registry.ipynb)
>
> [![](https://docs.cloud.google.com/static/vertex-ai/images/github-logo-32px.png)View on GitHub](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/agents/skill-registry/intro_skill_registry.ipynb)

# Skill Registry

This skill provides instructions for interacting with the **Skill Registry** on
the Gemini Enterprise Agent Platform. The Skill Registry allows you to create,
update, list, get, delete, and search for skills, as well as manage revisions
and monitor long-running operations.

## Core Capabilities

-   **Skill Discovery** — Query the registry to easily search, list, get
    specific skills, get skill revisions, and inspect revision histories.
-   **Skill Lifecycle Management** — Create, update, or permanently delete
    skills with support for zipped or folder-based payloads.
-   **Semantic Search** — Use the `RetrieveSkills` method to find skills by
    describing the task you want to accomplish (e.g., "find skills to manage
    cloud resources").
-   **Revision Management** — List and inspect individual revisions of a skill.
-   **Operation Monitoring** — Check the completion status of long-running
    operations (LROs) returned by create, update, and delete actions.
-   **Generate Skill** — Automate the initial scaffolding of new agent skills
    locally.

## Core Directives

-   **Mandatory Validation**: ALWAYS execute the environment validation check
    before performing any operations.

    ```bash
    python3 scripts/validate_env.py
    ```

## Prerequisites & Authentication

### Permissions

- For read-only access (list, get, search, list revisions, get revisions), the
  `roles/aiplatform.viewer` role is sufficient.
- For write operations (create, update, delete), you need
  `roles/aiplatform.admin` or equivalent.
- Skill Registry inherits project-level permissions.

### Library & Authentication

```bash
# Install required libraries
pip install google-auth requests

# Authenticate with Google Cloud
gcloud auth application-default login
```

### Environment Variables

The following variables are required for operations:

-   `GCP_PROJECT_ID`: Your Google Cloud project ID.
-   `GCP_LOCATION`: The region (e.g., `us-central1`). See [Available
    regions](#available-regions) below.

## Compliance

| Feature | Status |
|---|---|
| Access Transparency | Supported |
| Data Residency (DRZ) in US and EU | Supported |
| Customer-Managed Encryption Keys (CMEK) | Not Supported |
| HIPAA certification | Not Supported |
| VPC-SC | Not Supported |

## Available regions

| Region | Location |
|---|---|
| `us-central1` | Iowa |
| `europe-west4` | Netherlands |
| `us-east5` | Columbus, Ohio |

## Skill ID constraints

The `SKILL_ID` is **immutable** and remains permanently reserved once created,
even if you delete the skill later. Skill IDs must adhere to the following
constraints:

- Must be 1 to 63 characters long.
- Must contain only lowercase letters, numbers, and hyphens.
- Must start with a letter and end with a letter or number.
- Must not start with `gcp-` (this prefix is reserved for built-in skills).

> **Note:** Use a descriptive `SKILL_ID`. Since the `SKILL_ID` becomes the
> folder name when the skill is attached to an agent, a meaningful name helps
> the model understand the skill's purpose.

> **Caution:** Built-in skills with IDs starting with `gcp-` cannot be deleted.
> When you delete a skill, its `SKILL_ID` is reserved and cannot be reused for
> 24 hours.

## Quickstart

Quickly search for available skills in the registry:

```bash
python3 scripts/skill_registry_ops.py search \
  --query "test skill" \
  --top-k 5
```

---

## Operations

-   **Skill Discovery**: [query-skills.md](references/query-skills.md) — Search,
    list, get, retrieve skills, and inspect revision histories with REST,
    Python, and Node.js examples.
-   **Skill Lifecycle**: [manage-skills.md](references/manage-skills.md) —
    Create, update, and delete skills with REST, Python, and Node.js examples.
-   **Monitor Operations**:
    [monitor-operations.md](references/monitor-operations.md) — Check the
    status of long-running operations.
-   **Generate Skill**: [generate-skill.md](references/generate-skill.md) —
    Scaffold new agent skills locally.

## What's next

- **Attach skills to an agent**: Learn how to attach registered skills when
  creating or updating an agent using the Managed Agents API on Agent Platform.
  [See guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents/create-manage#create-attach-skills)
- **ADK Skill Registry integration**: Learn how to integrate with Skill
  Registry in the Agent Development Kit (ADK).
  [See documentation](https://adk.dev/integrations/skills-registry/)