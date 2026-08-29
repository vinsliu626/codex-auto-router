import { basename } from "node:path";
import {
  STUDIO_SCHEMA_VERSION,
  type RuntimeActor,
  type RuntimeEvidence,
  type StudioEvent,
  type TokenUsage,
  type WorkerStatus,
} from "../shared/types.js";

type UnknownRecord = Record<string, unknown>;

export interface CodexAdapterOptions {
  sourcePath: string;
  actorMode?: "auto" | "parent" | "worker";
  parentSessionId?: string;
  actorLabel?: string;
  taskSummary?: string;
  evidenceKind?: RuntimeEvidence["kind"];
}

interface RuntimeContext {
  model?: string;
  effort?: string;
  turnId?: string;
}

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function fileId(sourcePath: string): string {
  const match = basename(sourcePath).match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i);
  return match?.[1] ?? basename(sourcePath, ".jsonl");
}

function timestampFrom(row: UnknownRecord, payload: UnknownRecord): string {
  const candidate =
    string(row.timestamp) ??
    string(payload.started_at) ??
    string(payload.completed_at) ??
    new Date().toISOString();
  return Number.isNaN(Date.parse(candidate)) ? new Date().toISOString() : candidate;
}

function getNested(source: UnknownRecord | undefined, path: string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    cursor = record(cursor)?.[key];
  }
  return cursor;
}

function subagentMetadata(source: unknown): { parentSessionId?: string; label?: string } | undefined {
  const sourceRecord = record(source);
  const spawn = record(getNested(sourceRecord, ["subagent", "thread_spawn"]));
  if (!spawn) return undefined;
  return {
    parentSessionId: string(spawn.parent_thread_id),
    label: string(spawn.agent_nickname) ?? string(spawn.agent_path),
  };
}

function usageFromObject(value: unknown): TokenUsage | undefined {
  const usage = record(value);
  if (!usage) return undefined;

  const tokens: TokenUsage = {
    input: finiteNumber(usage.input_tokens ?? usage.inputTokens),
    cachedInput: finiteNumber(
      usage.cached_input_tokens ?? usage.cachedInputTokens ?? usage.cache_read_input_tokens,
    ),
    output: finiteNumber(usage.output_tokens ?? usage.outputTokens),
    reasoningOutput: finiteNumber(usage.reasoning_output_tokens ?? usage.reasoningOutputTokens),
    total: finiteNumber(usage.total_tokens ?? usage.totalTokens),
  };

  return Object.values(tokens).some((value) => value !== undefined) ? tokens : undefined;
}

export function extractTokenUsage(info: unknown): TokenUsage | undefined {
  const infoRecord = record(info);
  if (!infoRecord) return undefined;

  const candidates = [
    infoRecord.total_token_usage,
    infoRecord.last_token_usage,
    infoRecord.token_usage,
    infoRecord.usage,
    infoRecord,
  ];
  for (const candidate of candidates) {
    const usage = usageFromObject(candidate);
    if (usage) return usage;
  }
  return undefined;
}

function toolInput(payload: UnknownRecord): string {
  const input = payload.input ?? payload.arguments;
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input ?? "");
  } catch {
    return "";
  }
}

function verificationName(input: string): string | undefined {
  const checks: Array<[RegExp, string]> = [
    [/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|vitest)\b|\bvitest\b/i, "Tests"],
    [/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build)\b|\bvite\s+build\b/i, "Production build"],
    [/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:lint)\b|\beslint\b/i, "Lint"],
    [/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck)\b|\btsc\b/i, "Typecheck"],
  ];
  return checks.find(([pattern]) => pattern.test(input))?.[1];
}

function outputResult(output: unknown): "PASS" | "FAIL" | "UNKNOWN" {
  let text: string;
  try {
    text = typeof output === "string" ? output : JSON.stringify(output ?? "");
  } catch {
    return "UNKNOWN";
  }

  if (/"exit_code"\s*:\s*0\b|process exited with code 0\b/i.test(text)) return "PASS";
  if (/"exit_code"\s*:\s*[1-9]\d*\b|process exited with code [1-9]\d*\b/i.test(text)) return "FAIL";
  return "UNKNOWN";
}

export class CodexRolloutAdapter {
  readonly sourcePath: string;
  readonly parentSessionId?: string;

  private actorMode: "auto" | "parent" | "worker";
  private actorLabel?: string;
  private taskSummary?: string;
  private evidenceKind: RuntimeEvidence["kind"];
  private runtimeSessionId: string;
  private detectedParentSessionId?: string;
  private isSubagent = false;
  private subagentStartedAt = 0;
  private context: RuntimeContext = {};
  private taskStartedAt?: string;
  private runStarted = false;
  private workerSpawned = false;
  private completed = false;
  private sequence = 0;
  private verificationCalls = new Map<string, string>();

  constructor(options: CodexAdapterOptions) {
    this.sourcePath = options.sourcePath;
    this.actorMode = options.actorMode ?? "auto";
    this.parentSessionId = options.parentSessionId;
    this.detectedParentSessionId = options.parentSessionId;
    this.actorLabel = options.actorLabel;
    this.taskSummary = options.taskSummary;
    this.evidenceKind = options.evidenceKind ?? "codex-rollout";
    this.runtimeSessionId = fileId(options.sourcePath);
    this.isSubagent = this.actorMode === "worker";
  }

  get sessionId(): string {
    return this.runtimeSessionId;
  }

  get parentId(): string | undefined {
    return this.detectedParentSessionId;
  }

  get worker(): boolean {
    return this.actorMode === "worker" || (this.actorMode === "auto" && this.isSubagent);
  }

  get confirmedModel(): string | undefined {
    return this.context.model;
  }

  get confirmedEffort(): string | undefined {
    return this.context.effort;
  }

  ingest(rowValue: unknown, lineNumber: number): StudioEvent[] {
    const row = record(rowValue);
    if (!row) return [];
    const payload = record(row.payload) ?? {};
    const rowType = string(row.type);
    const payloadType = string(payload.type);
    const timestamp = timestampFrom(row, payload);
    const events: StudioEvent[] = [];

    if (rowType === "session_meta") {
      const meta = subagentMetadata(payload.source);
      const threadSource = string(payload.thread_source);
      if (meta || threadSource === "subagent") {
        this.isSubagent = true;
        this.detectedParentSessionId = meta?.parentSessionId ?? this.detectedParentSessionId;
        this.actorLabel = meta?.label ?? this.actorLabel;
        this.subagentStartedAt = Math.max(this.subagentStartedAt, Date.parse(timestamp));
        this.runtimeSessionId = string(payload.id) ?? this.runtimeSessionId;
      } else if (!(this.isSubagent && this.subagentStartedAt > Date.parse(timestamp))) {
        this.runtimeSessionId = string(payload.id) ?? this.runtimeSessionId;
      }
      return events;
    }

    if (this.worker && this.subagentStartedAt > 0 && Date.parse(timestamp) < this.subagentStartedAt) {
      return events;
    }

    if (rowType === "event_msg" && payloadType === "task_started") {
      this.taskStartedAt = string(payload.started_at) ?? timestamp;
      this.context = {};
      this.completed = false;
      if (this.worker) this.workerSpawned = false;
      else this.runStarted = false;
      return events;
    }

    if (rowType === "turn_context") {
      this.context = {
        model: string(payload.model),
        effort: string(payload.effort),
        turnId: string(payload.turn_id),
      };
      events.push(...this.startIfReady(lineNumber, this.taskStartedAt ?? timestamp));
      return events;
    }

    if (!this.context.model || (!this.worker && !this.runStarted) || (this.worker && !this.workerSpawned)) {
      return events;
    }

    if (rowType === "event_msg" && payloadType === "agent_reasoning") {
      events.push(this.statusEvent("THINKING", timestamp, lineNumber, payloadType));
    } else if (
      rowType === "response_item" &&
      (payloadType === "function_call" || payloadType === "custom_tool_call")
    ) {
      const name = string(payload.name) ?? "tool";
      const callId = string(payload.call_id) ?? `${lineNumber}`;
      const check = verificationName(toolInput(payload));
      if (!this.worker && check) {
        this.verificationCalls.set(callId, check);
        events.push(
          this.event(
            "verification.started",
            timestamp,
            lineNumber,
            { verification: { name: check } },
            payloadType,
          ),
        );
      } else {
        events.push(
          this.statusEvent(
            name === "wait" ? "WAITING" : check ? "VERIFYING" : "WORKING",
            timestamp,
            lineNumber,
            payloadType,
          ),
        );
      }
    } else if (
      rowType === "response_item" &&
      (payloadType === "function_call_output" || payloadType === "custom_tool_call_output")
    ) {
      const callId = string(payload.call_id);
      const check = callId ? this.verificationCalls.get(callId) : undefined;
      if (check && callId) {
        this.verificationCalls.delete(callId);
        events.push(
          this.event(
            "verification.completed",
            timestamp,
            lineNumber,
            { verification: { name: check, result: outputResult(payload.output) } },
            payloadType,
          ),
        );
      }
    } else if (rowType === "event_msg" && payloadType === "token_count") {
      const tokens = extractTokenUsage(payload.info);
      if (tokens) {
        events.push(
          this.event(
            "worker.token_checkpoint",
            timestamp,
            lineNumber,
            { tokens },
            payloadType,
          ),
        );
      }
    } else if (rowType === "event_msg" && payloadType === "turn_aborted") {
      this.completed = true;
      events.push(
        this.event(
          this.worker ? "worker.blocked" : "telemetry.warning",
          timestamp,
          lineNumber,
          { reason: string(payload.reason) ?? "Runtime turn aborted" },
          payloadType,
        ),
      );
    } else if (rowType === "event_msg" && payloadType === "task_complete" && !this.completed) {
      this.completed = true;
      events.push(
        this.event(this.worker ? "worker.completed" : "run.completed", timestamp, lineNumber, {}, payloadType),
      );
    }

    return events;
  }

  processCompleted(timestamp: string, exitCode: number, lineNumber = Number.MAX_SAFE_INTEGER): StudioEvent | undefined {
    if (!this.worker || !this.workerSpawned || this.completed) return undefined;
    this.completed = true;
    return this.event(
      exitCode === 0 ? "worker.completed" : "worker.blocked",
      timestamp,
      lineNumber,
      exitCode === 0 ? {} : { reason: `Worker process exited with code ${exitCode}` },
      "process_exit",
    );
  }

  private startIfReady(lineNumber: number, timestamp: string): StudioEvent[] {
    if (!this.context.model) return [];
    if (this.worker) {
      if (this.workerSpawned) return [];
      this.workerSpawned = true;
      return [
        this.event(
          "worker.spawned",
          timestamp,
          lineNumber,
          { status: "WORKING", task: this.taskSummary ? { summary: this.taskSummary } : undefined },
          "turn_context",
        ),
      ];
    }

    if (this.runStarted) return [];
    this.runStarted = true;
    return [
      this.event(
        "run.started",
        timestamp,
        lineNumber,
        {
          status: "THINKING",
          task: {
            id: this.context.turnId ?? this.runtimeSessionId,
            summary: this.taskSummary,
          },
        },
        "turn_context",
      ),
    ];
  }

  private actor(): RuntimeActor {
    return {
      id: this.runtimeSessionId,
      role: this.worker ? "worker" : "parent",
      model: this.context.model,
      effort: this.context.effort,
      label: this.actorLabel,
    };
  }

  private evidence(runtimeEvent: string): RuntimeEvidence {
    return {
      kind: this.evidenceKind,
      confirmed: true,
      sessionId: this.runtimeSessionId,
      parentSessionId: this.detectedParentSessionId,
      runtimeEvent,
      source: basename(this.sourcePath),
    };
  }

  private event(
    type: StudioEvent["type"],
    timestamp: string,
    lineNumber: number,
    details: Partial<StudioEvent>,
    runtimeEvent: string,
  ): StudioEvent {
    this.sequence += 1;
    return {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      id: `${this.runtimeSessionId}:${lineNumber}:${this.sequence}:${type}`,
      timestamp,
      type,
      actor: this.actor(),
      evidence: this.evidence(runtimeEvent),
      ...details,
    };
  }

  private statusEvent(
    status: WorkerStatus,
    timestamp: string,
    lineNumber: number,
    runtimeEvent: string,
  ): StudioEvent {
    return this.event("worker.status", timestamp, lineNumber, { status }, runtimeEvent);
  }
}
