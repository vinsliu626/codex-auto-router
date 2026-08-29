import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadReplayText } from "../src/runtime/replay.js";
import { sanitizeText, sanitizeStudioEvent } from "../src/runtime/sanitize.js";
import { StudioStore } from "../src/server/studio-store.js";
import { studioEvent } from "./helpers.js";

describe("replay and privacy", () => {
  it("loads and replays the checked-in sanitized fixture", async () => {
    const text = await readFile(resolve("fixtures/spark-replay.jsonl"), "utf8");
    const replay = loadReplayText(text);
    const store = new StudioStore("replay");
    for (const event of replay.events) store.publish(event);
    expect(replay.warnings).toEqual([]);
    expect(store.state.workstations.spark.status).toBe("DONE");
    expect(store.state.workstations.terra.status).toBe("IDLE");
    expect(store.state.workstations.spark.tokens?.total).toBe(19_160);
  });

  it("ignores malformed and partial event lines while retaining valid events", () => {
    const valid = JSON.stringify(studioEvent("telemetry.warning", { reason: "safe" }));
    const result = loadReplayText(`{nope}\n${JSON.stringify({ schemaVersion: 1 })}\n${valid}\n`);
    expect(result.events).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
  });

  it("redacts common secrets and truncates displayed telemetry", () => {
    expect(sanitizeText("token=ghp_abcdefghijklmnopqrstuvwxyz123456")).toBe("token=[REDACTED]");
    expect(sanitizeText(`Bearer ${"a".repeat(40)}`)).toBe("[REDACTED]");
    expect(sanitizeText("x".repeat(300))?.length).toBe(180);
  });

  it("sanitizes task and reason fields before the store exposes them", () => {
    const sanitized = sanitizeStudioEvent(
      studioEvent("task.queued", {
        task: { summary: "Deploy with api_key=super-secret-key" },
        reason: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      }),
    );
    expect(JSON.stringify(sanitized)).not.toContain("super-secret-key");
    expect(JSON.stringify(sanitized)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
