# ProjectPilot AI MVP — Phase 2.2

Azure App Service + Moveworks ready.

## Test
```bash
npm test
```
Expected: `All Phase 2.2 tests passed.`

## Start
```bash
npm start
```

## Azure App Service
The server uses `process.env.PORT || 7071` and binds to `0.0.0.0`, so it is ready for Linux App Service.

Health: `GET /api/health`

Moveworks: `POST /api/ai-plan`

Request body:
```json
{"project_requirement":"Create a project plan..."}
```

Data Mapper:
```text
{"project_requirement": project_requirement}
```

All plans stay `DRAFT` until `/api/approve-plan` is called.

For real Azure DevOps creation, configure App Service environment variables: `AZDO_ORG`, `AZDO_PROJECT`, `AZDO_PAT`.
