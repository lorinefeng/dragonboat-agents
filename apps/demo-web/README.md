# DragonBoat Demo Web App

This package contains the local DragonBoat command deck: a Vite/React UI plus a Hono API used by the DragonBoat CLI.

It is no longer just a static demo board. In v0.1 it is the local monitoring surface for a foreground Codex steerer and dynamically controlled Claude Code rowers.

## Current Role

The command deck is responsible for:

- showing the current run and active crew wave
- rendering the Codex steerer and Claude rowers as a React Flow crew graph
- showing Agents group chat messages from the local mailbox ledger
- showing readable agent output before raw terminal/debug output
- projecting evidence, claim, workflow, and event data from `.dragonboat/runs/<run_id>/`
- hosting local API endpoints used by `dragonboat steer`, `dragonboat rower start`, `dragonboat message send`, `dragonboat evidence submit`, and related commands

The browser does not create a foreground Codex session by itself. Users start the Web deck first, then launch the native Codex CLI from the project terminal.

## Run Locally

From the repository root:

```bash
npm run demo:dev
```

Default local URLs:

- Web: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`

The product CLI wraps this with a friendlier entrypoint:

```bash
dragonboat deck --open

# In a second terminal, inside the project to steer:
dragonboat steer --open
```

When default ports are busy, pass explicit ports:

```bash
dragonboat deck --workspace /path/to/project --api-port 18787 --web-port 15173 --open
```

## No-Token Smoke Run

To verify that the Web deck can project a local DragonBoat run without spending provider tokens:

```bash
dragonboat smoke run --workspace /path/to/project --open
dragonboat acceptance smoke --latest
```

If the deck was already open before the smoke run was created, reconcile it into the live API:

```bash
dragonboat run reconcile --workspace /path/to/project --run <run_id>
```

The expected visible surfaces are:

- one Codex steerer node
- one stopped release-smoke Claude rower
- one `intent_confirmed` Agents group chat message
- one passed evidence item
- readable agent output for the smoke rower

## Tests And Build

From the repository root:

```bash
npm run demo:test
npm run demo:build
git diff --check
```

Targeted package commands:

```bash
npm test -w @dragonboat/demo-web
npm run build -w @dragonboat/demo-web
```

## Architecture Notes

- `src/server/demoApi.ts` defines the local Hono API.
- `src/server/sessionStore.ts` manages `.dragonboat/runs/<run_id>/` session state and can import CLI-created runs while the API is already running.
- `src/server/demoEngine.ts` derives the command-deck snapshot from local events.
- `src/cli/dragonboatCli.ts` implements the product CLI used by the Web deck, foreground Codex steerer, and Claude rower lifecycle.
- `src/App.tsx` renders the current Web command deck.
- `src/shared/*` contains provider-neutral contracts for events, routing, evidence, delegation economics, workflows, claims, release readiness, and rower output projection.

Keep this app local-first and auditable. Raw events, terminal logs, and worktree artifacts are local run evidence; the UI should make them understandable without hiding the underlying ledger.
