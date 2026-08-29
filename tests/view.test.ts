import { describe, expect, it } from "vitest";
import { applyStudioEvent, createInitialStudioState, formatTokenValue } from "../src/state/studio-state.js";
import { renderInspector, renderWorkstation } from "../src/web/view.js";
import { actor, studioEvent } from "./helpers.js";

describe("Studio view", () => {
  it("renders missing usage as NOT EXPOSED rather than zero", () => {
    const html = renderInspector(createInitialStudioState(), "spark");
    expect(html).toContain("NOT EXPOSED");
    expect(formatTokenValue(undefined)).toBe("NOT EXPOSED");
    expect(formatTokenValue(0)).toBe("0");
  });

  it("renders explicit accessible status labels for active workers", () => {
    const spark = actor("worker", "gpt-5.3-codex-spark", "spark-1");
    const state = applyStudioEvent(
      createInitialStudioState(),
      studioEvent("worker.spawned", { actor: spark, task: { summary: "Build UI" } }),
    );
    const html = renderWorkstation(state.workstations.spark, true);
    expect(html).toContain("WORKING");
    expect(html).toContain("gpt-5.3-codex-spark");
    expect(html).toContain("aria-label=\"Spark, WORKING\"");
  });
});
