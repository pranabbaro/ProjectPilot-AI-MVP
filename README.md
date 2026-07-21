# ProjectPilot AI Phase 2.1

Tested Codespaces-ready MVP endpoint for Moveworks.

Run:

```bash
npm test
npm start
```

Moveworks HTTP Action:

- POST `/api/ai-plan`
- JSON body: `{"project_requirement":"<dynamic Moveworks value>"}`

The endpoint accepts either a plain requirement (connectivity test/fallback) or a fully structured Moveworks-generated plan. It always returns `status: DRAFT`. Azure DevOps writes remain behind `/api/approve-plan`.

Do not commit Azure DevOps secrets. Use Codespaces secrets for `AZDO_ORG`, `AZDO_PROJECT`, and `AZDO_PAT`.
