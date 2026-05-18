# v0.1 Demo Story

The first DragonBoat demo should prove one thing:

> Codex can steer Claude Code workers through a real software task while DragonBoat makes the process visible and reviewable.

## Demo Title

Codex steers. Claude Code rows. DragonBoat records the race.

## Demo Setup

The demo starts with a newly created minimal full-stack web app.

The exact framework is not decided in this document. The demo app should be small, local, easy to run, and capable of showing meaningful frontend, backend, and QA/Ops work.

## Crew

- **Steerer**: Codex CLI using the user's premium reasoning setup.
- **Frontend Rower**: Claude Code CLI in an isolated worktree.
- **Backend Rower**: Claude Code CLI in an isolated worktree.
- **QA/Ops Rower**: Claude Code CLI in an isolated worktree.

All Claude Code rowers may use the same local Claude Code configuration. Their identities come from their task packet, worktree, mailbox identity, and evidence bundle.

## Story Arc

1. The user gives DragonBoat a full-stack task.
2. Codex reads the repo and creates a task graph.
3. Codex writes one task packet per rower.
4. Each Claude Code rower receives its packet.
5. Each rower returns a short plan for approval.
6. Codex approves or revises the plans.
7. Rowers work in isolated worktrees.
8. Backend sends API contract updates through the mailbox.
9. Frontend asks or acknowledges contract details through the mailbox.
10. QA/Ops watches runability and test coverage.
11. Each rower submits an evidence bundle.
12. Codex reviews all evidence.
13. DragonBoat desktop replays the run.

## Suggested Task Shape

The demo task should include:

- one user-visible UI change
- one backend/API change
- one validation or error path
- tests or checks that can pass or fail
- a small operational runbook or health check

The point is coordination, not app complexity.

## What The Viewer Should See

The viewer should be able to answer:

- Who is steering?
- Who is rowing?
- What did each rower own?
- How did agents pass information to each other?
- What evidence came back?
- What did the steerer accept or reject?

## Demo Success

The demo succeeds if DragonBoat feels like a command deck for an AI engineering crew, not a terminal trick for launching multiple agents.
