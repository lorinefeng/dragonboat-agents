# Web Access Skill Adapter Notes

DragonBoat treats [`eze-is/web-access`](https://github.com/eze-is/web-access) as an opt-in browser-research capability for selected Claude Code rowers.

This should not be enabled for every worker by default. It is useful when the task requires real browser state, dynamic pages, visual inspection, media extraction, screenshots, or logged-in browsing. It is not needed for ordinary code, backend, documentation, or static text research tasks.

## What Web Access Provides

Based on the project README and skill file, Web Access adds:

- tool selection among WebSearch, WebFetch, curl, Jina, and browser CDP
- Chrome, Edge, or Chromium-family browser access through CDP
- interaction with dynamic pages through DOM evaluation, clicks, scrolling, uploads, and screenshots
- user-browser history/bookmark lookup
- media URL extraction and video frame capture
- site experience accumulation across sessions

This directly addresses a current DragonBoat runtime gap: rowers doing fashion, visual, social-commerce, or product-page research often hit WebSearch 400s, WebFetch timeouts, anti-bot pages, or JavaScript-rendered pages. A browser-backed path gives those rowers a more faithful observation layer than terminal-only fetches.

## Recommended DragonBoat Scope

Enable this only for rowers whose task packet explicitly declares one of these capabilities:

- `browser_research`
- `visual_research`
- `image_research`
- `social_platform_research`
- `dynamic_page_research`

Good candidates:

- visual benchmark rower
- product-page research rower
- social-commerce/Xiaohongshu/Douyin research rower
- UI/UX screenshot verification rower

Poor candidates:

- backend contract rower
- pure code-search rower
- docs-only rower
- generic QA rower without browser acceptance checks

## Integration Contract

A rower packet that uses Web Access should include a dedicated section:

```md
## Browser Research Capability

- Tooling: web-access
- Browser: chrome | edge | user-default
- Allowed domains:
  - <domain>
- Required artifacts:
  - screenshot paths
  - source URLs
  - extracted media URLs when relevant
  - short note explaining what each screenshot proves
- Safety:
  - do not operate private accounts or publish content without explicit user approval
  - stop and mailbox the steerer if browser CDP is unavailable
```

## Preconditions

Web Access requires Node.js 22+ and a Chromium-family browser with remote debugging enabled. The skill supports Claude Code plugin installation:

```sh
claude plugin marketplace add https://github.com/eze-is/web-access
claude plugin install web-access@web-access --scope user
```

It also supports skill installation through:

```sh
npx skills add eze-is/web-access
```

DragonBoat should not silently install or activate browser automation for all rowers. The steerer should request user approval before first use because browser automation can interact with logged-in sessions and may trigger platform anti-automation policies.

## DragonBoat Integration

DragonBoat exposes this capability through:

```sh
.dragonboat/bin/dragonboat browser doctor --workspace <path>
.dragonboat/bin/dragonboat browser smoke --workspace <path> --url http://127.0.0.1:5173 --model kimi-k2.6 --effort max
```

`browser doctor` checks Node.js, Claude Code plugin visibility, `web-access` dependency health, CDP proxy health, and `.dragonboat/browser-artifacts/<run_id>/` writability. It records `browser.capability.checked`.

`browser smoke` records a `route.decision.recorded` for `kimi-k2.6 / max / browser_research`, asks Claude Code to use web-access/CDP, writes a screenshot, and submits `browser_research` evidence.

## Near-Term Implementation Path

1. Keep browser access opt-in through route capabilities such as `browser_research`, `dynamic_page_research`, `visual_research`, and `social_platform_research`.
2. Selected sealed task packets receive a `Browser Research Capability` section.
3. The steerer must run `browser doctor` before launching a browser rower.
4. Route choices and browser checks are recorded as auditable events.
5. Evidence gate requires source URLs, screenshots, browser/CDP commands, and risk disclosure for `browser_research` tasks.

Safe manual fallback: if CDP or web-access is unhealthy, the rower must submit a blocker instead of silently downgrading to terminal-only fetching.
