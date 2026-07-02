import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("command deck layout CSS", () => {
  it("keeps the topbar brand title and action toolbar in separate responsive grid areas", () => {
    const topbarRule = styles.match(/\.topbar\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const brandRule = styles.match(/\.brand-lockup\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const actionsRule = styles.match(/\.run-actions\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(topbarRule).toContain("display: grid");
    expect(topbarRule).toContain("grid-template-areas");
    expect(brandRule).toContain("grid-area: brand");
    expect(actionsRule).toContain("grid-area: actions");
  });

  it("moves graph relationship controls away from rower cards at README screenshot widths", () => {
    const mediumViewportRule = styles.match(/@media\s*\(max-width:\s*1480px\)\s*\{(?<body>[\s\S]*?)\n\}/)?.groups
      ?.body ?? "";

    expect(mediumViewportRule).toContain(".graph-link-index");
    expect(mediumViewportRule).toContain("bottom: 64px");
    expect(mediumViewportRule).toContain("flex-wrap: wrap");
    expect(mediumViewportRule).toContain("max-height: 76px");
    expect(mediumViewportRule).toContain("overflow: hidden");
    expect(mediumViewportRule).toContain(".graph-terminal-shortcuts");
    expect(mediumViewportRule).toContain("grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))");
  });
});
