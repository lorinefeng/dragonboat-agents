# Model Routing And Cost Control

DragonBoat treats model routing as an auditable product decision, not as a hidden provider default.

## Default Pattern

- Use a high-context steerer model for planning, decomposition, and final review.
- Use lower-cost or specialized rower models for sealed execution tasks.
- Use multimodal rowers for screenshots, browser evidence, visual QA, and design judgment.
- Record route choices as `route.decision.recorded` events so replay can explain why a rower used a specific model and effort level.

## Current v0.1 Adapter Boundary

- Steerer: foreground Codex CLI.
- Rowers: Claude Code CLI workers managed by DragonBoat.
- Route state: `.dragonboat/routing-policy.json` and per-run `.dragonboat/runs/<run_id>/agent-config.json`.

DragonBoat does not rewrite a user's global provider configuration. It passes route intent through startup args, slash commands, task-packet route blocks, and local run events.

## Capabilities

Typical route capabilities:

- `text`
- `code`
- `browser_research`
- `dynamic_page_research`
- `visual_research`
- `ui_qa`
- `social_platform_research`

Browser and visual capabilities should block when web-access/CDP or multimodal model health is missing. They should not silently downgrade to a pure text route.

## Evidence Gate Relationship

Model routing only saves money if rower output is bounded and reviewable.

DragonBoat pairs routing with:

- Delegation Fit assessment before launching a crew.
- Sealed task packets that limit rereading and scope drift.
- Mailbox handoffs that make coordination explicit.
- Evidence Gate checks that reject false done claims.
- Benchmark records that separate hard telemetry from soft estimates.

## Public Story

The economic claim is modest and testable:

> Do expensive global reasoning once, then delegate sealed, verifiable sub-work to cheaper or more specialized agents.

If a task has low Delegation Fit, DragonBoat should recommend the foreground steerer instead of pretending a crew will help.
