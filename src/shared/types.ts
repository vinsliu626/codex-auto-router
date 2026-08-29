export const STUDIO_SCHEMA_VERSION = 1 as const;

export const WORKER_TIERS = [
  "parent",
  "spark",
  "terra",
  "luna",
  "gpt-5.5",
  "sol",
] as const;

export type WorkerTier = (typeof WORKER_TIERS)[number];

export const WORKER_STATUSES = [
  "IDLE",
  "WORKING",
  "THINKING",
  "WAITING",
  "VERIFYING",
  "BLOCKED",
  "DONE",
] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export type OverallStatus = "IDLE" | "RUNNING" | "BLOCKED" | "DONE";

export type StudioEventType =
  | "run.started"
  | "run.completed"
  | "routing.recommended"
  | "routing.transition"
  | "task.queued"
  | "worker.spawned"
  | "worker.status"
  | "worker.token_checkpoint"
  | "worker.completed"
  | "worker.blocked"
  | "verification.started"
  | "verification.completed"
  | "telemetry.warning";

export interface RuntimeActor {
  id: string;
  role: "parent" | "worker";
  model?: string;
  effort?: string;
  label?: string;
}

export interface RuntimeEvidence {
  kind: "codex-rollout" | "verified-process" | "verified-bridge" | "replay";
  confirmed: boolean;
  sessionId?: string;
  parentSessionId?: string;
  runtimeEvent?: string;
  source?: string;
}

export interface TokenUsage {
  input?: number;
  cachedInput?: number;
  output?: number;
  reasoningOutput?: number;
  total?: number;
}

export interface StudioEvent {
  schemaVersion: typeof STUDIO_SCHEMA_VERSION;
  id: string;
  timestamp: string;
  type: StudioEventType;
  actor?: RuntimeActor;
  status?: WorkerStatus;
  task?: {
    id?: string;
    summary?: string;
  };
  fromTier?: WorkerTier;
  toTier?: WorkerTier;
  reason?: string;
  tokens?: TokenUsage;
  verification?: {
    name: string;
    result?: "PASS" | "FAIL" | "UNKNOWN";
  };
  evidence: RuntimeEvidence;
}

export interface WorkerRunSnapshot {
  actorId: string;
  runtimeModel?: string;
  effort?: string;
  task?: string;
  startedAt?: string;
  endedAt?: string;
  tokens?: TokenUsage;
}

export interface WorkstationState {
  tier: WorkerTier;
  label: string;
  status: WorkerStatus;
  actorId?: string;
  runtimeModel?: string;
  effort?: string;
  task?: string;
  startedAt?: string;
  endedAt?: string;
  settleAt?: string;
  tokens?: TokenUsage;
  recentEventIds: string[];
  lastRun?: WorkerRunSnapshot;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  type: StudioEventType;
  tier?: WorkerTier;
  label: string;
  tone: "neutral" | "active" | "success" | "warning" | "danger";
}

export interface StudioState {
  schemaVersion: typeof STUDIO_SCHEMA_VERSION;
  mode: "live" | "replay";
  overallStatus: OverallStatus;
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  parentModel?: string;
  parentEffort?: string;
  route?: string;
  workstations: Record<WorkerTier, WorkstationState>;
  queue: string[];
  timeline: TimelineEntry[];
  warnings: string[];
  eventCount: number;
  lastUpdatedAt: string;
}

export interface ReplayLoadResult {
  events: StudioEvent[];
  warnings: string[];
}

export function isWorkerTier(value: unknown): value is WorkerTier {
  return typeof value === "string" && (WORKER_TIERS as readonly string[]).includes(value);
}

export function isWorkerStatus(value: unknown): value is WorkerStatus {
  return typeof value === "string" && (WORKER_STATUSES as readonly string[]).includes(value);
}
