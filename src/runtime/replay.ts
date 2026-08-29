import { readFile } from "node:fs/promises";
import {
  STUDIO_SCHEMA_VERSION,
  isWorkerStatus,
  isWorkerTier,
  type ReplayLoadResult,
  type StudioEvent,
  type StudioEventType,
} from "../shared/types.js";
import { sanitizeStudioEvent } from "./sanitize.js";

const EVENT_TYPES = new Set<StudioEventType>([
  "run.started",
  "run.completed",
  "routing.recommended",
  "routing.transition",
  "task.queued",
  "worker.spawned",
  "worker.status",
  "worker.token_checkpoint",
  "worker.completed",
  "worker.blocked",
  "verification.started",
  "verification.completed",
  "telemetry.warning",
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseStudioEvent(value: unknown): StudioEvent | undefined {
  const candidate = object(value);
  if (!candidate) return undefined;
  if (candidate.schemaVersion !== STUDIO_SCHEMA_VERSION) return undefined;
  if (typeof candidate.id !== "string" || typeof candidate.timestamp !== "string") return undefined;
  if (Number.isNaN(Date.parse(candidate.timestamp))) return undefined;
  if (typeof candidate.type !== "string" || !EVENT_TYPES.has(candidate.type as StudioEventType)) return undefined;

  const evidence = object(candidate.evidence);
  if (
    !evidence ||
    typeof evidence.kind !== "string" ||
    typeof evidence.confirmed !== "boolean" ||
    !["codex-rollout", "verified-process", "verified-bridge", "replay"].includes(evidence.kind)
  ) {
    return undefined;
  }

  if (candidate.status !== undefined && !isWorkerStatus(candidate.status)) return undefined;
  if (candidate.fromTier !== undefined && !isWorkerTier(candidate.fromTier)) return undefined;
  if (candidate.toTier !== undefined && !isWorkerTier(candidate.toTier)) return undefined;

  return sanitizeStudioEvent(candidate as unknown as StudioEvent);
}

export function loadReplayText(text: string): ReplayLoadResult {
  const events: StudioEvent[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      warnings.push(`Line ${index + 1}: malformed JSON ignored`);
      continue;
    }

    const event = parseStudioEvent(parsed);
    if (!event) {
      warnings.push(`Line ${index + 1}: invalid or partial Studio event ignored`);
      continue;
    }
    events.push(event);
  }

  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { events, warnings };
}

export async function loadReplayFile(path: string): Promise<ReplayLoadResult> {
  return loadReplayText(await readFile(path, "utf8"));
}
