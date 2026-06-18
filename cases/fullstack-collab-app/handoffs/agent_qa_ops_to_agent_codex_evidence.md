# QA/Ops Evidence Bundle

- Task: `task_qa_ops`
- Workspace: `cases/fullstack-collab-app`
- Commands:
  - `npm test -w @dragonboat-case/fullstack-collab-app`
- Result:
  - Domain tests passed for register/login, board loading, list reorder, and cross-list card movement.
  - Frontend test passed for account creation, board render, and moving `API contract` into `Doing`.
- Mailbox checked:
  - Backend sent API/reorder contract to frontend.
  - Frontend asked backend for card reorder semantics before guessing.
  - Frontend handed drag-sort verification path to QA/Ops.

