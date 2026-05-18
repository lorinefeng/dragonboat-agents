# AGENTS.md

This repository is for DragonBoat, a local-first crew layer for cross-platform coding agents.

## Communication

- Use Chinese when conversing with the project owner unless they request another language.
- Write project-facing documentation in English by default.
- Keep README, architecture, protocol, schema, and agent-facing docs concise and agent-readable.

## Product Direction

DragonBoat is not a generic agent wrapper. Its center of gravity is coordination semantics:

- crew identity
- task packets
- peer-to-peer mailbox messages
- evidence bundles
- local event logs
- command-deck replay

The v0.1 demo direction is:

- Codex CLI acts as the steerer.
- Claude Code CLI acts as rower workers.
- Three rowers handle frontend, backend, and QA/Ops work.
- Each worker uses an isolated worktree.
- The desktop surface shows progress, mailbox traffic, evidence, and replay.

Treat this demo stack as the first proof, not as the permanent architecture. DragonBoat must remain cross-platform and user-owned.

## Current Phase

The repository is in day-one design and documentation mode.

Do not introduce implementation code, dependencies, generated apps, or framework choices unless the current task explicitly asks for implementation.

## Design Principles

- Local-first before cloud-first.
- Cross-platform before vendor-specific convenience.
- Evidence before claims.
- User-owned model routing before provider lock-in.
- Small verifiable tasks before autonomous mega-runs.
- Desktop as command deck and replay surface, not as an agent configuration replacement.

## Implementation Guardrails

When implementation begins:

- Prefer the repo's existing patterns over new abstractions.
- Keep agent adapters separated from core crew/task/evidence semantics.
- Keep worker outputs auditable: commands, logs, diffs, failures, and risks.
- Avoid hidden destructive operations.
- Never assume all agents support the same real-time control APIs.
- Use soft real-time delivery where needed: hooks/plugins when available, polling when necessary.
