import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startStudioServer, type StudioServer } from "../src/server/studio-server.js";
import { actor, studioEvent } from "./helpers.js";

let server: StudioServer | undefined;
let webRoot: string | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (webRoot) await rm(webRoot, { force: true, recursive: true });
  webRoot = undefined;
});

describe("Studio localhost transport", () => {
  it("serves health/state and rejects unauthenticated event writes", async () => {
    webRoot = await mkdtemp(join(tmpdir(), "router-studio-"));
    await writeFile(join(webRoot, "index.html"), "<h1>Studio</h1>");
    server = await startStudioServer({ webRoot, port: 0 });

    const health = await fetch(`${server.url}/api/health`);
    expect(health.ok).toBe(true);
    const rejected = await fetch(`${server.url}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(studioEvent("telemetry.warning", { reason: "test" })),
    });
    expect(rejected.status).toBe(403);
  });

  it("rejects bridge attempts to fabricate worker execution", async () => {
    webRoot = await mkdtemp(join(tmpdir(), "router-studio-"));
    await writeFile(join(webRoot, "index.html"), "<h1>Studio</h1>");
    server = await startStudioServer({ webRoot, port: 0 });
    const fakeWorker = studioEvent("worker.spawned", {
      actor: actor("worker", "gpt-5.3-codex-spark", "fake-worker"),
      evidence: { kind: "verified-bridge", confirmed: true },
    });

    const response = await fetch(`${server.url}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Token": server.token,
      },
      body: JSON.stringify(fakeWorker),
    });
    expect(response.status).toBe(422);
    expect(server.store.state.workstations.spark.status).toBe("IDLE");
  });
});
