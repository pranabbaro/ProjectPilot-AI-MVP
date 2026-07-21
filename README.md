# Project Command Center v4.1 — Standard Handover Governance

This version uses the supplied standard `Handover.docx` template.

## Workflow

```text
Architect downloads standard template
→ Architect completes all mandatory sections
→ Architect uploads completed DOCX/PDF
→ Project Command Center validates completion checklist
→ Submit to PM
→ PM reviews and approves
→ PM adds stakeholder signers
→ Send to Adobe Acrobat Sign
→ Track agreement status
→ Download signed agreement
→ Archive signed PDF to SharePoint
→ Handover Completed
```

## Template sections represented in the mandatory checklist

- Document metadata
- Revision history
- Business Use Case
- ITCCS / CAP rating and ISEQ
- Application interfaces
- Backup, RTO and RPO
- Stakeholders and contacts
- Cloud network topology
- Physical network / firewall topology
- Authentication
- Authorization
- Network zone and deployed resources
- Encryption
- Supporting documents

## Adobe Acrobat Sign configuration

Add these App Service environment variables:

```text
ADOBE_SIGN_ACCESS_TOKEN=<OAuth access token>
ADOBE_SIGN_API_BASE=https://api.<your-region>.echosign.com/api/rest/v6
```

For production, use your organization's Adobe Sign OAuth application/refresh-token lifecycle rather than manually maintaining a short-lived access token.

The integration uses:
- `POST /transientDocuments`
- `POST /agreements`
- `GET /agreements/{agreementId}`
- `GET /agreements/{agreementId}/combinedDocument`

## SharePoint archive configuration

Uses the existing Microsoft Graph settings:

```text
GRAPH_TENANT_ID
GRAPH_CLIENT_ID
GRAPH_CLIENT_SECRET
SHAREPOINT_SITE_ID
SHAREPOINT_DRIVE_ID
SHAREPOINT_FOLDER_PATH
```

## New endpoints

```text
GET  /api/handover/status
POST /api/handover/submit
POST /api/handover/send-for-signature
GET  /api/handover/adobe-status
POST /api/handover/archive-signed
```

The standard template is available from:

```text
/templates/Handover.docx
```


## v4.2 — Live Arrange Call Product Experience

The webpage now includes a full Live Arrange Call product feature even before delegated authentication is enabled.

Visible capabilities:
- signed-in PM organizer area
- meeting title, date, time and duration
- attendee list
- Teams meeting option
- project-aware agenda generation
- DevOps compliance in meeting agenda
- PMO actions and risks in agenda
- Schedule Teams Meeting button
- Upcoming meeting cards

Until delegated authentication is enabled, the feature runs in `PRODUCT_PREVIEW` mode and prepares the meeting without making a live Microsoft Graph calendar write.

App Service switch:

```text
DELEGATED_GRAPH_ENABLED=false
DEMO_PM_DISPLAY_NAME=Project Manager
DEMO_PM_EMAIL=project.manager@company.com
```

Later, after implementing the Entra delegated OAuth session/token flow, set:

```text
DELEGATED_GRAPH_ENABLED=true
```

The UI does not need to be redesigned when authentication is enabled.
