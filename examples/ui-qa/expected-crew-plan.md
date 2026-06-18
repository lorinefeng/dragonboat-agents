# Expected Crew Plan

- `agent_visual_qa`: multimodal rower for screenshot inspection and visual issue ranking.
- Optional `agent_frontend_fix`: only if the visual QA report identifies a bounded, non-trivial fix.

This example should block if browser/CDP health fails. It should not silently use text-only research.
