# DragonBoat Crew Lessons

This is the shared learning document for the current DragonBoat workspace.

Use it to preserve practical coordination lessons that should affect future steerer plans and rower task packets. Keep entries short, evidence-backed, and actionable.

## How To Use This File

- The steerer reads this file before drafting a crew plan.
- The steerer summarizes relevant lessons into every task packet.
- Every rower reads this file before acting.
- After a run, the steerer appends new lessons from QA review, blockers, evidence, and user feedback.
- Do not treat this file as a substitute for the user's latest instruction. If a lesson conflicts with the user's current request, ask the user or follow the explicit current request.

## Current Lessons

### UI And UX Work Requires Visual Evidence

- UI rowers must verify the live local page, not only tests or code.
- For DragonBoat's web command deck, use `http://127.0.0.1:5173` as the local preview target when the dev server is running.
- UI handoff must include screenshot paths, browser/Playwright commands, and a short explanation of what each screenshot proves.
- QA may reject a frontend handoff that lacks screenshots, operation path, and main-workspace visibility proof.

### Done Means Visible In The Tracked Workspace

- A rower's isolated worktree can be correct while the tracked workspace is still missing the result.
- Evidence should say whether changes remain only in the rower worktree or are visible in the tracked workspace.
- Handoff should list touched files and the command used to verify the tracked workspace state.

### Mailbox Before Evidence

- Required handoffs should be sent through DragonBoat mailbox before evidence submission.
- Durable mailbox messages are valid even if the recipient rower has not started yet.
- If the API is down or a PTY is not running, DragonBoat can queue the message in `.dragonboat/runs/<run_id>/inbox/<agentId>/*.md`; rowers should check that inbox before claiming no instruction arrived.
- Evidence without the expected handoff is not enough for crew acceptance.

### Low-Fit Tasks Should Stay With The Steerer

- Not every task should be crewed. Small UI fixes, live runtime drift, foreground hook/session diagnosis, and tasks that cannot be sealed often cost less when the foreground Codex steerer handles them directly.
- Before launching rowers, score Delegation Fit and check hard blockers. A low score is not a failure; it is a product signal to avoid unnecessary coordination tax.
- Rower tasks should be sealed, parallelizable, and reviewable. If a rower needs to rediscover the whole repository or invent the acceptance path, the task packet is not sealed enough.

### Parallel Review Needs A Shared Mission And Peer Challenge

- Multi-rower review tasks should start from one shared mission, not only separate role prompts.
- Each rower should confirm its understanding with an `intent_confirmed` mailbox before substantive work.
- Peer challenge is required when the point of a crew is multi-perspective analysis. Without peer mail, rowers become independent report writers.
- The Stop-hook watchdog is not live supervision. The steerer should run `dragonboat supervise wait` when it needs to stay awake for rower intent, status, evidence, blockers, or timeout.

### Browser Research Is Opt-In And Must Be Preflighted

- Use browser-backed research only for tasks that truly need a real page, screenshot, or multimodal visual observation.
- The steerer must run `dragonboat browser doctor` before launching browser research rowers.
- Browser research packets must name allowed domains, source URLs, screenshot requirements, and a blocker rule when CDP or web-access is unhealthy.
- Evidence for browser research must include sources, screenshot paths, browser/CDP commands, and remaining risks.

### Agent Count Is Not The Value

- Do not use large agent counts as proof that DragonBoat helped.
- Use `workflow assess` when a task may need phased fan-out, refuters, or independent verification.
- Dynamic workflows should have explicit phases, conservative concurrency, claim sources, refutation, and unresolved-conflict reporting.
- If a rower makes an unsupported claim, treat it as unverified until another agent or artifact supports it.

## New Lesson Entry Template

```md
### YYYY-MM-DD - Short Lesson Title

- Trigger: what happened.
- Lesson: what future agents should do differently.
- Applies to: steerer | backend | frontend | qa_ops | all.
- Evidence: run id, handoff path, screenshot path, command, or review note.
- Follow-up: optional next action.
```
