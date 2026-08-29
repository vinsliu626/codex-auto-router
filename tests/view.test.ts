import { describe, expect, it } from "vitest";
import {
  DONE_HOLD_MS,
  advanceStudioClock,
  applyStudioEvent,
  createInitialStudioState,
  formatTokenValue,
} from "../src/state/studio-state.js";
import {
  WORKSTATION_PRESENTATION,
  presentationClock,
  renderInspector,
  renderNavigationView,
  renderTaskOverview,
  renderWorkstation,
} from "../src/web/view.js";
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
    expect(html).toContain("/assets/studio/spark/spark-working.webp");
    expect(html).not.toContain("class=\"person");
  });

  it("never presents a completed assignment as the current idle task", () => {
    const spark = actor("worker", "gpt-5.3-codex-spark", "spark-1");
    let state = applyStudioEvent(
      createInitialStudioState(),
      studioEvent("worker.spawned", { actor: spark, task: { summary: "Finished UI batch" } }),
    );
    const completed = studioEvent("worker.completed", { actor: spark });
    state = applyStudioEvent(state, completed);
    state = advanceStudioClock(state, Date.parse(completed.timestamp) + DONE_HOLD_MS + 1);

    const html = renderWorkstation(state.workstations.spark, false);
    expect(html).toContain("No active assignment");
    expect(html).not.toContain("<strong>Finished UI batch</strong>");
    expect(html).toContain("Last run");
  });

  it("uses one optimized local art asset for every worker tier", () => {
    const art = Object.values(WORKSTATION_PRESENTATION).map((presentation) => presentation.art);
    expect(new Set(art).size).toBe(6);
    expect(art.every((path) => path.startsWith("/assets/studio/") && path.endsWith(".webp"))).toBe(true);
  });

  it("keeps overview estimates and quota telemetry explicitly unavailable", () => {
    const state = createInitialStudioState();
    const overview = renderTaskOverview(state);
    const settings = renderNavigationView("settings", state);
    expect(overview).toContain("Progress</dt><dd>NOT EXPOSED");
    expect(overview).toContain("Complexity</dt><dd>NOT EXPOSED");
    expect(overview).toContain("Risk</dt><dd>NOT EXPOSED");
    expect(settings).toContain("Quota telemetry</dt><dd>NOT EXPOSED");
    expect(overview).not.toContain("Estimated");
  });

  it("uses event time for replay elapsed values and wall time for live mode", () => {
    const replay = createInitialStudioState("replay", "2026-01-15T18:30:03.000Z");
    const live = createInitialStudioState("live", "2026-01-15T18:30:03.000Z");
    expect(presentationClock(replay, 99)).toBe(Date.parse("2026-01-15T18:30:03.000Z"));
    expect(presentationClock(live, 99)).toBe(99);
  });
});
