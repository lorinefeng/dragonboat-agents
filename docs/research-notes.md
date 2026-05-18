# Research Notes

These notes capture early lessons from multi-agent coding workflows and related tools.

## Code Agent Orchestra

Source: https://addyosmani.com/blog/code-agent-orchestra/

Key lessons:

- The bottleneck in multi-agent coding is coordination and verification, not raw code generation.
- Useful systems separate lead-agent planning from worker execution.
- Shared task lists, file ownership, hooks, reviewer agents, and evidence-based checks reduce chaos.
- Peer messaging prevents the lead agent from becoming a manual relay for every detail.
- Parallelism is useful only when tasks are bounded and reviewable.

DragonBoat takeaway:

The product should not optimize for "launch many agents". It should optimize for structured delegation, visible progress, and verifiable results.

## Claude Code Teams Practice

Source: https://www.heyuan110.com/posts/ai/2026-02-28-claude-code-teams-guide/

Key lessons:

- A team lead agent should split tasks, monitor progress, and synthesize results.
- Worker tasks should be small, clear, and role-specific.
- Shared task state helps agents avoid invisible drift.
- Peer-to-peer mailbox messages are valuable for API contracts, blockers, questions, and review.
- Frequent status checks and explicit completion evidence matter.

DragonBoat takeaway:

Claude Code team practices are valuable, but DragonBoat should move the same collaboration semantics outside one vendor's ecosystem.

## Cross-Platform Direction

DragonBoat should define its own crew/task/mailbox/evidence model.

Agent-specific integrations should be adapters, not the core product. Codex, Claude Code, Gemini CLI, OpenCode, and future tools will differ in how they support hooks, plugins, MCP, ACP, wrappers, or polling.

DragonBoat should tolerate that difference.

## Related Protocols And Tools

### MCP

MCP is useful for exposing DragonBoat tools to agents.

Potential fit:

- `claim_task`
- `send_message`
- `poll_inbox`
- `submit_evidence`
- `report_status`

MCP should be treated as one integration path, not the whole architecture.

### ACP

ACP is useful for client-to-agent session control and editor integration patterns.

Potential fit:

- start or observe agent sessions
- normalize session events
- support future editor or desktop integration

ACP is not a complete peer-mailbox model by itself.

### c2c

c2c demonstrates that local cross-agent communication can combine hooks, plugins, MCP, sideband channels, and polling.

DragonBoat should learn from this adapter strategy while keeping its own higher-level semantics.

### Vibe Kanban

Vibe Kanban shows the value of local agent task boards, worktrees, and review flows.

DragonBoat should not compete by merely being another board. Its distinct focus should be crew semantics, peer mailbox, evidence bundles, and replayable command-deck storytelling.
