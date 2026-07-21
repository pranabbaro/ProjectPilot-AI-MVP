# Project Command Center v2.5

Management-ready AI-powered project delivery command center.

## Azure App Service ready

The application listens on:

```text
process.env.PORT || 7071
```

and binds to `0.0.0.0`, so it works on Azure App Service and GitHub Codespaces.

## Existing integration endpoints remain unchanged

- `GET /api/health`
- `POST /api/ai-plan`
- `POST /api/approve-plan`

This means the existing Moveworks HTTP Action does not need to change.

## Run tests

```bash
npm test
```

Expected result:

```text
All Project Command Center v2.5 tests passed.
```

## Start

```bash
npm start
```

## Management UI

Public-facing wording has been changed to **Project Command Center**.

The UI does not display:
- Hackathon Edition
- developer/test wording
- internal implementation details

It retains:
- AI project requirement entry
- generated project-plan visualization
- Features, User Stories, Tasks and Sprint metrics
- human-in-the-loop governance messaging
- management-friendly enterprise presentation
