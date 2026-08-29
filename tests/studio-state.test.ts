import { describe, expect, it } from "vitest";
import { advanceStudioClock, applyStudioEvent, createInitialStudioState } from "../src/state/studio-state.js";
import { actor, studioEvent } from "./helpers.js";

describe("studio state truthfulness", () => {
  it("does not activate a recommended worker without execution evidence", () => {
    const state = applyStudioEvent(
      createInitialStudioState(),
      studioEvent("routing.recommended", {
        actor: actor("parent", "gpt-5.6-sol"),
        toTier: "spark",
        evidence: { kind: "replay", confirmed: false },
      }),
    );
    expect(state.workstations.spark.status).toBe("IDLE");
    expect(state.timeline).toHaveLength(1);
  });

  it("does not describe an unconfirmed spawn as execution", () => {
    const state = applyStudioEvent(
      createInitialStudioState(),
      studioEvent("worker.spawned", {
        actor: actor("worker", "gpt-5.3-codex-spark", "spark-unconfirmed"),
        evidence: { kind: "replay", confirmed: false },
      }),
    );
    expect(state.workstations.spark.status).toBe("IDLE");
    expect(state.timeline[0]?.label).toContain("not execution evidence");
  });

  it("tracks simultaneous parent and child execution", () => {
    const parent = actor("parent", "gpt-5.6-sol", "parent-1");
    const spark = actor("worker", "gpt-5.3-codex-spark", "spark-1");
    let state = applyStudioEvent(createInitialStudioState(), studioEvent("run.started", { actor: parent }));
    state = applyStudioEvent(state, studioEvent("worker.spawned", { actor: spark }));
    expect(state.workstations.parent.status).toBe("THINKING");
    expect(state.workstations.spark.status).toBe("WORKING");
  });

  it("applies worker state transitions only to the confirmed actor", () => {
    const spark = actor("worker", "gpt-5.3-codex-spark", "spark-1");
    let state = applyStudioEvent(createInitialStudioState(), studioEvent("worker.spawned", { actor: spark }));
    state = applyStudioEvent(state, studioEvent("worker.status", { actor: spark, status: "WAITING" }));
    state = applyStudioEvent(
      state,
      studioEvent("worker.status", {
        actor: actor("worker", "gpt-5.3-codex-spark", "unconfirmed-actor"),
        status: "WORKING",
      }),
    );
    expect(state.workstations.spark.status).toBe("WAITING");
  });

  it("shows Spark to Luna escalation without faking Luna activity", () => {
    let state = applyStudioEvent(
      createInitialStudioState(),
      studioEvent("routing.transition", { fromTier: "spark", toTier: "luna", reason: "Integration risk" }),
    );
    expect(state.route).toBe("spark → luna");
    expect(state.workstations.luna.status).toBe("IDLE");
    state = applyStudioEvent(
      state,
      studioEvent("worker.spawned", { actor: actor("worker", "gpt-5.6-luna", "luna-1") }),
    );
    expect(state.workstations.luna.status).toBe("WORKING");
  });

  it("shows Sol to Spark and Terra downgrade handoffs", () => {
    let state = applyStudioEvent(
      createInitialStudioState(),
      studioEvent("routing.transition", { fromTier: "sol", toTier: "spark" }),
    );
    expect(state.route).toBe("sol → spark");
    state = applyStudioEvent(state, studioEvent("routing.transition", { fromTier: "sol", toTier: "terra" }));
    expect(state.route).toBe("sol → terra");
  });

  it("holds DONE before returning a completed worker to IDLE", () => {
    const spark = actor("worker", "gpt-5.3-codex-spark", "spark-1");
    let state = applyStudioEvent(createInitialStudioState(), studioEvent("worker.spawned", { actor: spark }));
    const completed = studioEvent("worker.completed", { actor: spark });
    state = applyStudioEvent(state, completed);
    expect(state.workstations.spark.status).toBe("DONE");
    const final = advanceStudioClock(state, Date.parse(completed.timestamp) + 2_001);
    expect(final.workstations.spark.status).toBe("IDLE");
    expect(final.workstations.spark.lastRun?.runtimeModel).toBe("gpt-5.3-codex-spark");
  });

  it("keeps a blocked worker visibly blocked", () => {
    const luna = actor("worker", "gpt-5.6-luna", "luna-1");
    let state = applyStudioEvent(createInitialStudioState(), studioEvent("worker.spawned", { actor: luna }));
    state = applyStudioEvent(state, studioEvent("worker.blocked", { actor: luna, reason: "Dependency unavailable" }));
    expect(state.workstations.luna.status).toBe("BLOCKED");
    expect(state.overallStatus).toBe("BLOCKED");
  });

  it("merges real token checkpoints without inventing missing fields", () => {
    const spark = actor("worker", "gpt-5.3-codex-spark", "spark-1");
    let state = applyStudioEvent(createInitialStudioState(), studioEvent("worker.spawned", { actor: spark }));
    state = applyStudioEvent(
      state,
      studioEvent("worker.token_checkpoint", { actor: spark, tokens: { input: 120, total: 140 } }),
    );
    state = applyStudioEvent(
      state,
      studioEvent("worker.token_checkpoint", { actor: spark, tokens: { cachedInput: 80, output: 20 } }),
    );
    expect(state.workstations.spark.tokens).toEqual({ input: 120, cachedInput: 80, output: 20, total: 140 });
    expect(state.workstations.spark.tokens?.reasoningOutput).toBeUndefined();
  });
});
