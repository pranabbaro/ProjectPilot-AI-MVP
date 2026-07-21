# ProjectPilot AI MVP — Phase 1

A browser-based Project Delivery Command Center for demonstrating:

- Arrange Project Call
- Project dashboard
- Prompt to Epic → Feature → User Story → Task hierarchy
- Project discussion intelligence
- MOM generation
- Handover readiness assessment

## Why this version is easy to run

This MVP uses only Node.js built-in modules. There are no external npm dependencies and no `npm install` step.

## Run in GitHub Codespaces

1. Upload all files to a private GitHub repository.
2. Select **Code → Codespaces → Create codespace on main**.
3. In the Codespaces terminal run:

```bash
npm start
```

4. Open forwarded port **7071**.

## Run tests

```bash
npm test
```

Expected output:

```text
All tests passed.
```

## Demo prompt

```text
Build an Employee Service Portal where employees can submit IT requests,
managers can approve or reject requests, and the service team can track
request status. Include notifications and reporting.
```

## Current limitation

Phase 1 uses deterministic demo logic and does not write to Azure DevOps or create real Outlook meetings. Phase 2 will add Azure DevOps REST API integration with approval controls.
