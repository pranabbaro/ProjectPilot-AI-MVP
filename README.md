# Project Command Center v3.1 — Live Azure DevOps

## What's real in v3.1

- Reads live Azure DevOps work items into the dashboard.
- Shows Azure DevOps connection status.
- Generates project plans through `/api/ai-plan`.
- Requires explicit browser/PM approval before write.
- Creates Epic → Feature → User Story → Task hierarchy in Azure DevOps.
- Refreshes the dashboard from Azure DevOps after creation.

## App Service environment variables

Configure these under Azure App Service → Settings → Environment variables:

```text
AZDO_ORG=<Azure DevOps organization name>
AZDO_PROJECT=<Azure DevOps project name>
AZDO_PAT=<PAT with Work Items Read & Write>
AZDO_STORY_TYPE=User Story
```

Optional:

```text
AZDO_AREA=<Area Path>
AZDO_ITERATION=<Default Iteration Path>
AZDO_ITERATION_PREFIX=<Project\IterationPrefix>
AZDO_DASHBOARD_TOP=30
```

For Scrum process projects, set:

```text
AZDO_STORY_TYPE=Product Backlog Item
```

Do not commit PATs into GitHub.

## API endpoints

- `GET /api/health`
- `GET /api/devops/status`
- `GET /api/devops/work-items`
- `POST /api/ai-plan`
- `POST /api/approve-plan`

`POST /api/approve-plan` requires:

```json
{
  "approved": true,
  "plan": { "...": "generated plan" }
}
```

## Run

```bash
npm test
npm start
```
