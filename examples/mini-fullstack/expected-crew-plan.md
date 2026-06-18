# Expected Crew Plan

- `agent_backend`: implement or document the sortable endpoint contract.
- `agent_frontend`: implement the task-list control after receiving backend contract.
- `agent_qa_ops`: verify API and UI behavior, then submit final review to steerer.

Peer handoff path:

1. `agent_backend -> agent_frontend`: `contract`
2. `agent_frontend -> agent_qa_ops`: `status`
3. `agent_qa_ops -> agent_codex`: `evidence`

This example should use `agent_team`, not `dynamic_workflow`.
