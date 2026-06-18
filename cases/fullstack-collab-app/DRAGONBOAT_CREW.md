# DragonBoat Fullstack Collaboration Case

This folder is the shared case workspace for a steerer plus three rowers:

- `agent_codex`: steerer, dispatcher, monitor, final reviewer.
- `agent_backend`: auth, boards, lists, cards, reorder contracts.
- `agent_frontend`: registration/login UI, kanban board, list/card drag-sort wiring.
- `agent_qa_ops`: integration checks, automated tests, final evidence.

All workers are expected to read:

- `../../docs/skills/dragonboat-steerer.md` for the main agent role.
- `../../docs/skills/dragonboat-rower.md` for worker mailbox behavior.

The committed `handoffs/` folder contains representative diff handoffs passed between agents during this case. The live run also writes `.dragonboat/runs/run_demo_web_loop/events.json`, which is ignored by git and used by the replay MP4 exporter.

