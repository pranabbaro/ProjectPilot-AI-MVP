# ProjectPilot AI MVP — Phase 2

Phase 2 adds the governed **Prompt → Epic → Feature → User Story → Task → PM Approval → Azure DevOps** workflow.

## Run in GitHub Codespaces

No `npm install` is required.

```bash
npm test
npm start
```

Open forwarded port **7071**.

## Demo mode

Without Azure DevOps secrets, approval is simulated. This is intentional so the MVP remains demoable.

## Real Azure DevOps mode

Add these **Codespaces secrets** (do not commit them):

- `AZDO_ORG` — Azure DevOps organization name
- `AZDO_PROJECT` — target test project
- `AZDO_PAT` — short-lived PAT with Work Items Read & Write
- `AZDO_ITERATION` — optional, e.g. `MyProject\Sprint 1`
- `AZDO_AREA` — optional area path

Restart the Codespace/server after adding secrets.

The app will display **AZURE DEVOPS • <project>** when configured.

## Upgrade from Phase 1

Replace these files/folders in your repository with Phase 2 versions:

- `server.js`
- `test.js`
- `package.json`
- `public/`
- `.devcontainer/`
- `README.md`

Keep `.gitignore`. Do not commit `.env` or PAT values.

## Safety

The Azure DevOps write operation only runs after **Approve & Create in Azure DevOps** is selected. Use a test Azure DevOps project for the MVP.
