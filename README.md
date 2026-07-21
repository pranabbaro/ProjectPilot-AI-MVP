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
