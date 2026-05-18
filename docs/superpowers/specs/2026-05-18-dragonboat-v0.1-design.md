# DragonBoat v0.1 Design

Date: 2026-05-18

## Status

Approved direction for day-one documentation and pre-implementation planning.

Implementation has not started.

## Product Essence

DragonBoat is a local-first crew layer for cross-platform coding agents.

It turns a local repository into a coordinated boat where one steerer agent can delegate bounded software tasks to worker rowers, preserve context, enable peer handoffs, and collect evidence before work is accepted.

## Brand And Repository

- Product name: DragonBoat
- GitHub repository name: dragonboat-crew
- Target owner: lorinefeng
- Public release target: Dragon Boat Festival 2026, on June 19, 2026

The repository name uses a qualifier to avoid confusion with existing projects named Dragonboat.

## v0.1 Demo

The first demo uses:

- Codex CLI as steerer
- Claude Code CLI as rowers
- one frontend rower
- one backend rower
- one QA/Ops rower
- isolated worktrees per rower
- a newly created minimal full-stack web app
- local event capture
- command-deck desktop replay

## Core Concepts

DragonBoat v0.1 should be designed around:

- Crew
- Task Packet
- Peer Mailbox
- Evidence Bundle
- Event Log
- Command Deck

These concepts are product semantics. Specific agent integrations should remain adapters.

## Desktop Scope

The desktop app is for:

- live workflow visibility
- mailbox tracing
- evidence inspection
- replay
- launch demo storytelling

It is not for configuring Codex, Claude Code, or other agent accounts in v0.1.

## Non-Goals

DragonBoat v0.1 does not attempt:

- full autonomy
- cloud control plane
- every-agent support
- shared-worktree parallel editing
- IDE replacement
- automatic merge without steerer/user review
- hard real-time communication across all platforms

## Open Implementation Work

The next phase should produce an implementation plan before code is written.

That plan should decide:

- local data store shape
- event schema
- task packet format
- evidence bundle format
- mailbox delivery model
- Codex adapter boundary
- Claude Code adapter boundary
- desktop technology
- demo app stack

Those decisions are intentionally outside this day-one design document.
