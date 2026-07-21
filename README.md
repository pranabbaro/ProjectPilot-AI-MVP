# Project Command Center v4.0 — PMO Governance

## Removed
- Executive Summary navigation and page.

## Added
### Azure DevOps Dashboard
Live dashboard for:
- Epics
- Features
- User Stories / Product Backlog Items
- Tasks
- State
- Assignee
- Iteration
- Tags

### Azure DevOps Compliance
Per-work-item compliance checks:
- Tags updated
- Sprint / Iteration assigned
- Description updated
- Acceptance Criteria updated for User Stories/PBIs
- Assigned To updated
- Start/Finish dates for Epic/Feature where applicable

### MOM Synchronization
Analyse the latest call discussion and the MOM panel updates immediately from that discussion.

### Document Upload
Upload up to 10 MB in the MVP directly to:
- SharePoint document library folder through Microsoft Graph
- Azure DevOps Git repository folder through the Git Push REST API

## App Service environment variables

### Azure DevOps
```text
AZDO_ORG
AZDO_PROJECT
AZDO_PAT
AZDO_STORY_TYPE=User Story
AZDO_PMO_ASSIGNEE
AZDO_REPO_ID
AZDO_REPO_BRANCH=refs/heads/main
AZDO_REPO_FOLDER_PATH=project-documents
```

PAT scopes need Work Items read/write. Repository upload additionally needs code write permission.

### SharePoint / Microsoft Graph
```text
GRAPH_TENANT_ID
GRAPH_CLIENT_ID
GRAPH_CLIENT_SECRET
SHAREPOINT_SITE_ID
SHAREPOINT_DRIVE_ID
SHAREPOINT_FOLDER_PATH=Project Command Center
```

The Entra application must have suitable Microsoft Graph application permissions to write to the target SharePoint site/library. Prefer site-scoped permissions such as Sites.Selected where your organization supports it.

## API endpoints
```text
GET  /api/health
GET  /api/devops/status
GET  /api/devops/work-items
GET  /api/devops/compliance
POST /api/ai-plan
POST /api/approve-plan
POST /api/discussion-summary
POST /api/mom
POST /api/devops/create-discussion-item
GET  /api/documents/status
POST /api/documents/upload
```
