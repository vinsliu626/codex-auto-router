import { describe, expect, it } from "vitest";
import { CodexRolloutAdapter, extractTokenUsage } from "../src/runtime/codex-adapter.js";

const at = (timestamp: string, type: string, payload: Record<string, unknown>) => ({ timestamp, type, payload });

describe("Codex rollout adapter", () => {
  it("normalizes a parent model and effort from task + turn context evidence", () => {
    const adapter = new CodexRolloutAdapter({ sourcePath: "rollout-parent.jsonl", actorMode: "parent" });
    expect(
      adapter.ingest(at("2026-01-01T00:00:00.000Z", "event_msg", { type: "task_started", started_at: "2026-01-01T00:00:00.000Z" }), 1),
    ).toEqual([]);
    const events = adapter.ingest(
      at("2026-01-01T00:00:00.100Z", "turn_context", { model: "gpt-5.6-sol", effort: "xhigh", turn_id: "turn-1" }),
      2,
    );
    expect(events[0]).toMatchObject({
      type: "run.started",
      actor: { role: "parent", model: "gpt-5.6-sol", effort: "xhigh" },
      evidence: { confirmed: true, runtimeEvent: "turn_context" },
    });
  });

  it("requires a worker's own turn context before emitting worker.spawned", () => {
    const adapter = new CodexRolloutAdapter({ sourcePath: "rollout-worker.jsonl", actorMode: "worker" });
    expect(adapter.ingest(at("2026-01-01T00:00:00.000Z", "event_msg", { type: "task_started" }), 1)).toEqual([]);
    const events = adapter.ingest(
      at("2026-01-01T00:00:00.100Z", "turn_context", { model: "gpt-5.3-codex-spark", effort: "low" }),
      2,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "worker.spawned", actor: { model: "gpt-5.3-codex-spark" } });
  });

  it("detects subagent identity and ignores inherited pre-spawn history", () => {
    const adapter = new CodexRolloutAdapter({ sourcePath: "rollout-child.jsonl" });
    adapter.ingest(
      at("2026-01-01T00:00:10.000Z", "session_meta", {
        id: "child-1",
        thread_source: "subagent",
        source: { subagent: { thread_spawn: { parent_thread_id: "parent-1", agent_nickname: "Spark" } } },
      }),
      1,
    );
    expect(
      adapter.ingest(
        at("2026-01-01T00:00:05.000Z", "turn_context", { model: "gpt-5.6-sol", effort: "xhigh" }),
        2,
      ),
    ).toEqual([]);
    adapter.ingest(
      at("2026-01-01T00:00:06.000Z", "session_meta", {
        id: "parent-1",
        thread_source: "user",
        source: "vscode",
      }),
      3,
    );
    const events = adapter.ingest(
      at("2026-01-01T00:00:10.100Z", "turn_context", { model: "gpt-5.3-codex-spark", effort: "low" }),
      4,
    );
    expect(adapter.parentId).toBe("parent-1");
    expect(events[0]).toMatchObject({
      type: "worker.spawned",
      actor: { id: "child-1", model: "gpt-5.3-codex-spark", label: "Spark" },
      evidence: { parentSessionId: "parent-1" },
    });
  });

  it("normalizes token checkpoint variants", () => {
    expect(
      extractTokenUsage({
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 70,
          output_tokens: 15,
          reasoning_output_tokens: 5,
          total_tokens: 115,
        },
      }),
    ).toEqual({ input: 100, cachedInput: 70, output: 15, reasoningOutput: 5, total: 115 });
  });

  it("marks aborted workers blocked and completed workers done", () => {
    const blocked = new CodexRolloutAdapter({ sourcePath: "blocked.jsonl", actorMode: "worker" });
    blocked.ingest(at("2026-01-01T00:00:00.000Z", "turn_context", { model: "gpt-5.6-luna" }), 1);
    expect(blocked.ingest(at("2026-01-01T00:00:01.000Z", "event_msg", { type: "turn_aborted", reason: "failed" }), 2)[0]?.type).toBe("worker.blocked");

    const done = new CodexRolloutAdapter({ sourcePath: "done.jsonl", actorMode: "worker" });
    done.ingest(at("2026-01-01T00:00:00.000Z", "turn_context", { model: "gpt-5.6-terra" }), 1);
    expect(done.ingest(at("2026-01-01T00:00:01.000Z", "event_msg", { type: "task_complete" }), 2)[0]?.type).toBe("worker.completed");
  });

  it("recognizes parent verification tool calls without retaining command text", () => {
    const adapter = new CodexRolloutAdapter({ sourcePath: "parent.jsonl", actorMode: "parent" });
    adapter.ingest(at("2026-01-01T00:00:00.000Z", "turn_context", { model: "gpt-5.6-sol" }), 1);
    const events = adapter.ingest(
      at("2026-01-01T00:00:01.000Z", "response_item", {
        type: "custom_tool_call",
        name: "exec",
        call_id: "call-1",
        input: { cmd: "npm test -- --secret=do-not-store" },
      }),
      2,
    );
    expect(events[0]).toMatchObject({ type: "verification.started", verification: { name: "Tests" } });
    expect(JSON.stringify(events[0])).not.toContain("do-not-store");
  });

  it("shows a worker verification command as VERIFYING", () => {
    const adapter = new CodexRolloutAdapter({ sourcePath: "worker.jsonl", actorMode: "worker" });
    adapter.ingest(at("2026-01-01T00:00:00.000Z", "turn_context", { model: "gpt-5.3-codex-spark" }), 1);
    const events = adapter.ingest(
      at("2026-01-01T00:00:01.000Z", "response_item", {
        type: "custom_tool_call",
        name: "exec",
        call_id: "call-1",
        input: { cmd: "npm run build" },
      }),
      2,
    );
    expect(events[0]).toMatchObject({ type: "worker.status", status: "VERIFYING" });
  });
});
