# Contributing to DragonBoat

DragonBoat is in early private-preview design.

The project is not ready for broad implementation contributions yet, but the contribution bar is already clear:

- preserve the local-first direction
- avoid single-vendor assumptions
- keep agent work auditable
- prefer small, verifiable tasks
- document protocol and behavior changes before implementation
- treat evidence as part of the product, not as optional logging

## Documentation

Project-facing documentation should be written in English by default.

Good DragonBoat documentation is:

- concise
- concrete
- agent-readable
- careful about scope
- explicit about non-goals

## Design Changes

Design changes should explain:

- the user problem
- the affected concepts
- the new behavior
- the compatibility impact
- the evidence required to trust the change

## Implementation Changes

When implementation begins, contributors should keep adapters separated from core semantics.

DragonBoat should be able to support many coding agents over time without letting one provider define the whole architecture.
