# DragonBoat Demo Web App

This app is the first practice slice for DragonBoat v0.1.

It is intentionally small: a full-stack command board that proves the basic crew-loop shape before the real DragonBoat runtime exists.

## What It Demonstrates

- Codex appears as the steerer.
- Three Claude Code rowers appear as frontend, backend, and QA/Ops workers.
- The frontend loads a run snapshot from a Hono API.
- The UI can record a backend-to-frontend contract handoff.
- The API updates task status, mailbox timeline, and evidence state.
- Tests cover backend behavior, frontend behavior, and the client-to-API contract.

## Commands

From the repository root:

```bash
npm run demo:dev
npm run demo:test
npm run demo:build
```

The dev server starts:

- frontend: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`

## Why This Came Before The Runtime

The implementation plan starts with schemas and core runtime primitives.

For this slice, we intentionally started with a runnable full-stack mock because DragonBoat's core value needs a visible workflow: crew, tasks, mailbox, evidence, and acceptance flow.

This does not replace the plan. It gives the plan a concrete target to serve.
