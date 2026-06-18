# P2 Agent Compute Economics

DragonBoat P2 turns the command deck from a local crew monitor into a privacy-aware, cost-aware agent compute control layer.

The goal is not to hide routing decisions. The goal is to make every decision auditable before a steerer sends work to local machines, remote runners, paid model subscriptions, or community-provided packs.

## Capabilities

### Compute Farm Placement

`dragonboat compute plan` evaluates local and remote workers against:

- required capabilities
- privacy class
- local-only policy
- worker trust zone
- health and concurrency
- cost and latency limits

Private code on remote team infrastructure returns `human_approval_required`; local-only work rejects cloud workers.

### Privacy-Aware Routing

`dragonboat privacy route` scans file paths and content before cloud routing.

It distinguishes:

- `cloud_allowed`
- `cloud_redacted`
- `local_only`
- `blocked`

`dragonboat privacy redact` can produce a sanitized file before a steerer hands content to cloud or remote agents.

### Subscription Advisor

`dragonboat subscription advise` combines subscription inventory with benchmark, capability, and cost traces.

It can recommend:

- keep
- downgrade
- cancel
- upgrade
- add low-cost/local capacity
- shift low-uncertainty work to local workers

These recommendations are advisory. The user remains the buyer and final router.

### Community Marketplace

`dragonboat marketplace` exposes a local, auditable pack interface for:

- role packs
- workflow packs
- tool gateways
- eval suites
- adapters

P2 ships a small built-in community catalog as product scaffolding, not as a remote package installer.

### Trace Learning

`dragonboat capability learn` reads historical route decisions and evidence-gate results to derive capability preferences.

It outputs `prefer`, `avoid`, or `probe_more` recommendations for agents and models. This is long-run capability learning: it should influence routing, but never silently override current privacy, budget, or human approval constraints.

## Events

P2 writes these local event types:

- `compute.placement.planned`
- `privacy.route.assessed`
- `subscription.advice.generated`
- `marketplace.pack.installed`
- `capability.learning.updated`

## Schemas

P2 public artifacts are represented by:

- `schemas/v0/compute-placement.schema.json`
- `schemas/v0/privacy-route.schema.json`
- `schemas/v0/subscription-advice.schema.json`
- `schemas/v0/marketplace-pack.schema.json`
- `schemas/v0/trace-learning.schema.json`

## Current Gaps

- Compute workers are represented as explicit JSON inventory, not auto-discovered infrastructure.
- Marketplace is a local manifest interface; it does not yet verify signatures or fetch remote packages.
- Subscription advice depends on trace quality and should not be treated as financial automation.
- Trace learning is descriptive and conservative. It does not yet auto-update routing policy.
