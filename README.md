# DragonBoat

> Your project is the boat.
> Your agents are the crew.
> You set the direction.

DragonBoat is a local-first crew layer for cross-platform coding agents.

It helps a high-end steerer agent delegate bounded software tasks to lower-cost worker agents, coordinate peer-to-peer handoffs, and collect verifiable evidence before anything is accepted.

## Why DragonBoat

Coding agents are powerful, but most of them still work in isolated sessions.

A solo builder can ask Codex, Claude Code, Gemini CLI, OpenCode, or other CLI-based agents to help, but the hard parts remain manual:

- moving enough context into each worker session
- splitting work into safe, bounded tasks
- tracking progress across multiple agents
- letting agents talk to each other without forcing the lead agent to relay every detail
- collecting diffs, tests, logs, and risks before accepting work
- choosing agents based on the user's own subscriptions, budget, and trust

DragonBoat exists for AI-native developers who want a crew, not another chat window.

## The v0.1 Promise

DragonBoat v0.1 is designed around one concrete demo:

> Codex steers three Claude Code rowers through a full-stack web task.

The steerer agent plans the work, creates task packets, monitors progress, reviews peer messages, and validates evidence. The rower agents work in isolated worktrees as frontend, backend, and QA/Ops specialists.

DragonBoat records the race:

- who was on the crew
- what each rower was asked to do
- which messages moved between agents
- what changed in each worktree
- which checks passed or failed
- why the steerer accepted or rejected the result

## Core Concepts

- **Crew**: the steerer, rowers, roles, capabilities, and local execution surfaces involved in a run.
- **Task Packet**: the bounded assignment handed to a worker, including context, constraints, deliverables, and acceptance criteria.
- **Peer Mailbox**: point-to-point agent messages for contracts, questions, blockers, status, review, and evidence.
- **Evidence Bundle**: the result package a worker returns, including diff summary, commands run, outputs, risks, and follow-up notes.
- **Command Deck**: the local desktop view for live progress, traceability, and replay.

## What DragonBoat Is Not

DragonBoat is not a model provider, an IDE, a cloud agent platform, or a generic agent wrapper.

The project does not try to hide every underlying CLI. Users should keep configuring Codex, Claude Code, and future agents in their native tools. DragonBoat focuses on coordination: tasks, messages, evidence, and local traceability.

## Naming

The project name is **DragonBoat**. The planned GitHub repository name is **dragonboat-crew**.

This project is not affiliated with the Go multi-group Raft library `lni/dragonboat` or the portfolio management product at `dragonboat.io`.

## Launch Direction

DragonBoat is being built toward a private preview first, with a public release planned around Dragon Boat Festival 2026, on June 19, 2026.

The first public milestone should make one thing obvious:

> One person should not have to row alone.
