# DragonBoat Concepts

This document defines the core language of DragonBoat.

The goal is to keep the product vocabulary stable before implementation details are chosen.

## Boat

A boat is a local software project under DragonBoat coordination.

The project repository is the boat. DragonBoat should not replace the repo, editor, package manager, or agent CLIs. It coordinates work around them.

## Crew

A crew is the set of agents participating in one run.

A crew includes:

- one steerer
- one or more rowers
- optional reviewers in future versions
- roles and responsibilities
- local execution surfaces
- status and presence

## Steerer

The steerer is the lead agent.

It handles:

- understanding the user's goal
- decomposing work
- assigning rower tasks
- approving worker plans
- monitoring progress
- resolving ambiguity
- reviewing evidence
- making the final acceptance recommendation

The steerer should usually be the strongest reasoning model the user has access to.

## Rower

A rower is a worker agent.

It handles:

- one bounded task
- one role-specific work area
- concrete implementation, testing, documentation, or operational checks
- peer handoffs through the mailbox
- an evidence bundle when done

Rowers may run cheaper, specialized, or locally configured models.

## Task Packet

A task packet is the handoff from steerer to rower.

It should include:

- task id
- role
- objective
- relevant context
- allowed files or work boundary
- disallowed changes
- dependencies
- acceptance criteria
- expected evidence
- reporting format

The purpose is to make delegation explicit and reviewable.

## Peer Mailbox

The peer mailbox is the message layer between agents.

Message types should include:

- `question`
- `contract`
- `status`
- `blocker`
- `review`
- `evidence`

A mailbox message should carry:

- sender
- recipient
- related task id
- message type
- body
- timestamp
- delivery state

The mailbox is not just chat. It is traceable engineering communication.

## Evidence Bundle

An evidence bundle is the result package from a rower.

It should include:

- task id
- summary
- files changed
- commands run
- command outputs or links to logs
- tests passed
- tests failed
- known risks
- unresolved questions
- follow-up recommendations

Evidence lets the steerer review work without trusting a bare "done".

## Event Log

The event log is the local record of a DragonBoat run.

It should capture:

- crew registration
- task creation
- task status changes
- mailbox messages
- command results
- evidence submissions
- steerer decisions

The event log powers traceability and replay.

## Command Deck

The command deck is the local desktop surface for DragonBoat.

It should show the current run as a visible workflow:

- crew roster
- task graph
- mailbox timeline
- evidence panel
- replay controls

The command deck is for observation, trust, and storytelling. It is not the primary place to configure agent accounts in v0.1.
