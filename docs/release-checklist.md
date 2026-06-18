# Release Checklist

DragonBoat should feel like a one-command local tool, but the repository also
contains local agent traces, worktrees, screenshots, and research notes. Use this
checklist before publishing a release or opening the public repository.

## Release Surfaces

### Must Ship In The npm Package

The npm package should contain only files required for installation, local
command-deck execution, examples, and public documentation:

- `bin/dragonboat.mjs`
- `bin/create-dragonboat.mjs`
- `apps/demo-web/index.html`
- `apps/demo-web/package.json`
- `apps/demo-web/public/`
- `apps/demo-web/src/`
- `apps/demo-web/tsconfig.json`
- `apps/demo-web/vite.config.ts`
- `docs/`
- `examples/`
- `schemas/`
- `README.md`
- `CONTRIBUTING.md`
- `LICENSE`

The package is intentionally source-based for v0.1 and runs through `tsx`.
A future release should ship compiled JavaScript for a smaller and faster
install.

### May Live In The GitHub Repository Only

These files are useful for contributors but should not be part of the runtime
package:

- `.github/`
- test files such as `*.test.ts` and `*.test.tsx`
- `apps/demo-web/src/test/`
- internal planning or research notes such as `docs/agent_team_feature_expansion_addendum.md`
- future benchmark traces used only for maintainer analysis

### Must Stay Private Or Ignored

Do not publish these files in npm or commit them to the public repository:

- `.dragonboat/runs/`
- `.dragonboat-worktrees/`
- `.worktrees/`
- `.claude/`
- `.superpowers/`
- local terminal logs
- provider keys, `.env`, `.env.*`
- private customer data, chat exports, or raw agent transcripts
- generated app build outputs such as `dist/`, `build/`, `coverage/`, and `node_modules/`

The repository `.gitignore` should keep these out of normal git tracking, and
`.npmignore` / `package.json#files` should keep them out of the package.

## Required Pre-Publish Commands

Run these from the repository root:

```bash
npm run demo:test
npm run demo:build
git diff --check
dragonboat release check
npm pack --dry-run
```

For a first-run product smoke:

```bash
dragonboat deck --open
dragonboat smoke run --open
dragonboat acceptance smoke --latest
```

For a real provider/browser readiness check:

```bash
dragonboat doctor
dragonboat doctor --deep --model kimi-k2.6 --effort max
dragonboat browser doctor
```

## Manual First-User Checks

Before announcing a release, verify these from a clean temporary workspace:

1. `dragonboat deck --open` renders an empty onboarding page, not an internal
   server error.
2. The empty page tells the user to start the foreground Codex steerer from a
   project terminal.
3. `dragonboat steer --open` creates or resumes the correct workspace session.
4. A no-token `dragonboat smoke run --open` projects into the already-open deck.
5. Default port conflicts move to the next free port.
6. Explicit port conflicts with unrelated services fail with an actionable
   message instead of printing fake started URLs.
7. Missing Codex or Claude Code CLIs are reported by `dragonboat doctor` with
   installation/authentication guidance.
8. The package preview from `npm pack --dry-run` does not include local runtime
   folders, worktrees, raw transcripts, or private project data.

## Release Blockers

Do not publish if any of these are true:

- `dragonboat release check` fails.
- `npm pack --dry-run` includes `.dragonboat/runs`, `.dragonboat-worktrees`,
  `.worktrees`, `.env`, `node_modules`, or build output folders.
- The README first screen does not show real command-deck screenshots.
- The empty Web deck exposes `Internal Server Error` as the main user path.
- The Web deck still shows a browser-only `New session` path that cannot launch
  the foreground Codex steerer.
- A smoke run cannot project a Codex steerer, a rower, a mailbox message, and an
  evidence item into the command deck.

## Known v0.1 Release Tradeoffs

- The command deck is a local development server, not a signed desktop app.
- The package still ships TypeScript source.
- The no-token smoke proves projection and coordination events, not model
  quality.
- Real multi-agent work still requires installed and authenticated provider
  CLIs.
- Runtime logs can contain sensitive prompts and file paths; users should review
  them before sharing bug reports.
