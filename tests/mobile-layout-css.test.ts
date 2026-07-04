import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("styles.css", "utf8");

describe("mobile editor layout CSS", () => {
  it("has a dedicated small-screen toolbar layout", () => {
    expect(css).toContain("@media (max-width: 700px)");
    expect(css).toContain(".skitch-layer-toolbar");
    expect(css).toContain("grid-template-columns: 1fr");
    expect(css).toContain(".skitch-layer-tool-palette");
    expect(css).toContain("overflow-x: auto");
  });

  it("keeps mobile editor controls touch-sized", () => {
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("touch-action: manipulation");
  });
});
