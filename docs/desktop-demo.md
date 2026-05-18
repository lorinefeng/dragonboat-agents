# Desktop Command Deck

The DragonBoat desktop app should make multi-agent coding work visible.

For v0.1, it is not an agent configuration center. It is a command deck and replay surface.

## Goals

- Show the crew at a glance.
- Show task ownership and progress.
- Show mailbox traffic between agents.
- Show evidence before acceptance.
- Replay a run for demos, debugging, and trust.

## First Screen

The first screen should feel like a calm engineering command deck.

It should prioritize:

- crew roster
- task graph
- live run state
- current blockers
- latest evidence

It should not look like a marketing landing page.

## Primary Views

### Crew View

Shows:

- steerer identity
- rower identities
- role
- platform
- worktree
- status
- last activity

### Task Graph

Shows:

- task packets
- dependencies
- status
- owner
- blocked state
- acceptance state

### Mailbox Timeline

Shows:

- messages between agents
- sender and recipient
- task reference
- message type
- delivery state
- timestamp

### Evidence Panel

Shows:

- submitted evidence bundles
- changed files
- commands run
- checks passed or failed
- risks
- steerer decision

### Replay Mode

Replays:

- crew registration
- task creation
- status changes
- mailbox messages
- evidence submission
- final review

Replay mode is important for launch storytelling. It should make a run understandable even after all terminals are closed.

## Non-Goals

The v0.1 desktop app should not:

- configure Codex accounts
- configure Claude Code accounts
- replace native CLI setup
- become a full IDE
- edit code directly
- hide the underlying evidence

## Design Tone

The command deck should feel sharp, elegant, local-first, and serious enough for real engineering work.

It can carry the DragonBoat identity, but the metaphor should support the workflow rather than decorate it.
