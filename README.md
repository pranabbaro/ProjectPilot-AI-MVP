# Project Command Center v3.2 — Discussion to Azure DevOps

## New in v3.2

The Latest Discussion Summary is now actionable.

Flow:

```text
Project Discussion Notes
        ↓
Decision / Action / Risk / New Requirement extraction
        ↓
PM review
        ↓
Create Task or User Story
        ↓
Azure DevOps
        ↓
PMO assignment/routing
```

## Azure App Service environment variables

Required for live Azure DevOps:

```text
AZDO_ORG=<organization>
AZDO_PROJECT=<project>
AZDO_PAT=<PAT with Work Items Read & Write>
AZDO_STORY_TYPE=User Story
```

PMO assignment:

```text
AZDO_PMO_ASSIGNEE=pmo-user@company.com
```

If `AZDO_PMO_ASSIGNEE` is not configured, the work item is still created and its description records `Owner: PMO`, but Azure DevOps `Assigned To` is left unset.

Optional:

```text
AZDO_AREA=<area path>
AZDO_ITERATION=<default iteration>
AZDO_ITERATION_PREFIX=<project\iteration-prefix>
```

## New endpoints

```text
POST /api/discussion-summary
POST /api/devops/create-discussion-item
```

`/api/devops/create-discussion-item` requires `"approved": true`.

## Existing endpoints retained

```text
GET  /api/health
GET  /api/devops/status
GET  /api/devops/work-items
POST /api/ai-plan
POST /api/approve-plan
```

## Test

```bash
npm test
```
