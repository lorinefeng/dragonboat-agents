# Contributing to DragonBoat

DragonBoat is a local-first coordination layer for agentic coding CLIs. The project is still early, so the best contributions are small, evidence-backed, and careful about adapter boundaries.

## What Helps Most

- Reproducible bug reports for `dragonboat init`, `dragonboat deck`, `dragonboat steer`, rower lifecycle, mailbox, evidence gates, and local run ledgers.
- Adapter research for Codex, Claude Code, Gemini CLI, OpenCode, Aider, and other agentic coding tools.
- Example tasks that show when a crew is faster or cheaper than a single agent.
- Documentation that makes local-first behavior, security boundaries, and model routing easier to understand.
- Focused fixes that improve release reliability without widening the product surface.

## Contribution Principles

- Keep the core product local-first and user-owned.
- Preserve the distinction between coordination semantics and provider-specific adapters.
- Treat evidence as part of the product, not optional logging.
- Prefer sealed, verifiable tasks over broad autonomous changes.
- Avoid hidden destructive operations.
- Do not assume every coding agent supports hooks, streaming, stdin injection, browser tools, or the same permission model.

## Development Setup

```bash
npm install
npm run demo:test
npm run demo:build
```

To run a local command deck from this repository:

```bash
npm run demo:dev
```

For end-user CLI smoke checks:

```bash
node bin/create-dragonboat.mjs --workspace /tmp/dragonboat-smoke
node bin/dragonboat.mjs doctor --workspace /tmp/dragonboat-smoke
```

## Pull Request Checklist

Before opening a PR, please include:

- A short explanation of the user problem.
- The affected DragonBoat concepts: crew, task packet, mailbox, evidence, routing, ledger, command deck, or adapter.
- Commands run and their results.
- Any remaining risks or unsupported environments.
- Screenshots or replay artifacts for command-deck UI changes.

## Documentation Style

Project-facing documentation should be written in English by default. Keep docs concise, concrete, and agent-readable.

Good docs answer:

- What changed?
- Why does it matter to a solo builder running multiple coding agents?
- What evidence proves it works?
- What is explicitly not supported yet?

## Security And Privacy

DragonBoat is local-first, but local run logs can still contain sensitive prompts, file paths, terminal output, or evidence summaries. Do not include private run artifacts, credentials, `.env` files, customer data, or raw transcripts in issues or PRs.

See [Security and privacy](docs/security-and-privacy.md) for details.
