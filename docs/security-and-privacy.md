# Security And Privacy

DragonBoat is local-first, but local-first does not mean risk-free. This document describes what the v0.1 demo writes, reads, and exposes.

## Local Files Written

DragonBoat writes project-local state under `.dragonboat/`:

- `.dragonboat/runs/<run_id>/events.ndjson`
- `.dragonboat/runs/<run_id>/logs/`
- `.dragonboat/runs/<run_id>/task-packets/`
- `.dragonboat/runs/<run_id>/uploads/`
- `.dragonboat/handoffs/`
- `.dragonboat/evidence/`
- `.dragonboat/routing-policy.json`
- `.dragonboat/bin/dragonboat`

Codex hook setup is written to:

- `.codex/hooks.json`

Rower worktrees are written under DragonBoat-managed local worktree directories and are excluded from normal git tracking by default.

## Sensitive Data Boundaries

DragonBoat task packets and skills instruct rowers not to read secrets such as:

- `.env`
- credentials
- private chat logs
- customer data
- provider keys
- unrelated personal files

This is a product guardrail, not a cryptographic sandbox. Users should still avoid launching agents in directories that contain secrets they do not want an agent to inspect.

## Terminal And Log Risks

The command deck can show:

- agent terminal output
- mailbox messages
- evidence summaries
- run events
- task packets and handoffs in raw/debug surfaces

Do not paste secrets into agent prompts or mailbox messages. Do not publish `.dragonboat/runs/` without reviewing it first.

## Isolated Rower Worktrees

Claude rowers run in isolated worktrees so their edits and artifacts are easier to review before merging back into the tracked workspace.

Isolation helps with reviewability and cleanup, but it is not a security boundary against a malicious tool or model.

## Cleanup

To clean a project workspace before sharing it:

```bash
rm -rf .dragonboat/runs .dragonboat-worktrees
```

Keep `.dragonboat/skills`, `.dragonboat/commands.md`, and `.dragonboat/routing-policy.json` if you want the workspace to remain DragonBoat-ready.

## Network And Browser Access

Browser-backed rowers and web research rowers may use local Chrome/Edge CDP or Claude Code tools. Run:

```bash
dragonboat doctor --deep
dragonboat browser doctor
```

before launching browser or visual rowers, and treat failures as blockers instead of silently downgrading.
