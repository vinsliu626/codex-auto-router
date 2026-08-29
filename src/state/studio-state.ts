import {
  STUDIO_SCHEMA_VERSION,
  WORKER_TIERS,
  type StudioEvent,
  type StudioState,
  type TimelineEntry,
  type TokenUsage,
  type WorkerStatus,
  type WorkerTier,
  type WorkstationState,
} from "../shared/types.js";

export const DONE_HOLD_MS = 2_000;

const LABELS: Record<WorkerTier, string> = {
  parent: "Parent / Orchestrator",
  spark: "Spark",
  terra: "Terra",
  luna: "Luna",
  "gpt-5.5": "GPT-5.5 fallback",
  sol: "Sol",
};

export function modelToTier(model: string | undefined): Exclude<WorkerTier, "parent"> | undefined {
  if (!model) return undefined;
  const normalized = model.toLowerCase();
  if (normalized.includes("spark")) return "spark";
  if (normalized.includes("terra")) return "terra";
  if (normalized.includes("luna")) return "luna";
  if (normalized.includes("gpt-5.5") || normalized.includes("gpt-5-5")) return "gpt-5.5";
  if (normalized.includes("sol")) return "sol";
  return undefined;
}

function emptyWorkstation(tier: WorkerTier): WorkstationState {
  return {
    tier,
    label: LABELS[tier],
    status: "IDLE",
    recentEventIds: [],
  };
}

export function createInitialStudioState(
  mode: StudioState["mode"] = "live",
  now = new Date().toISOString(),
): StudioState {
  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    mode,
    overallStatus: "IDLE",
    workstations: Object.fromEntries(
      WORKER_TIERS.map((tier) => [tier, emptyWorkstation(tier)]),
    ) as Record<WorkerTier, WorkstationState>,
    queue: [],
    timeline: [],
    warnings: [],
    eventCount: 0,
    lastUpdatedAt: now,
  };
}

function mergeTokens(current: TokenUsage | undefined, incoming: TokenUsage | undefined): TokenUsage | undefined {
  if (!incoming) return current;
  return { ...current, ...incoming };
}

function toneFor(event: StudioEvent): TimelineEntry["tone"] {
  if (event.type === "worker.spawned" && !event.evidence.confirmed) return "warning";
  if (event.type === "worker.blocked") return "danger";
  if (event.type === "telemetry.warning") return "warning";
  if (event.type === "worker.completed" || event.type === "run.completed") return "success";
  if (
    event.type === "worker.spawned" ||
    event.type === "worker.status" ||
    event.type.startsWith("verification")
  ) {
    return "active";
  }
  return "neutral";
}

function eventTier(event: StudioEvent): WorkerTier | undefined {
  if (event.actor?.role === "parent") return "parent";
  return modelToTier(event.actor?.model);
}

function timelineLabel(event: StudioEvent, tier: WorkerTier | undefined): string {
  const actor = tier ? LABELS[tier] : "Router";
  switch (event.type) {
    case "run.started":
      return `${actor} started the run`;
    case "run.completed":
      return `${actor} completed the run`;
    case "routing.recommended":
      return `Recommended ${event.toTier ?? "worker"}${event.reason ? ` · ${event.reason}` : ""}`;
    case "routing.transition":
      return `${event.fromTier ?? "route"} → ${event.toTier ?? "unknown"}${event.reason ? ` · ${event.reason}` : ""}`;
    case "task.queued":
      return `Queued ${event.task?.summary ?? "task"}`;
    case "worker.spawned":
      return event.evidence.confirmed ? `${actor} execution confirmed` : `${actor} spawn is not execution evidence`;
    case "worker.status":
      return `${actor} ${event.status?.toLowerCase() ?? "updated"}`;
    case "worker.token_checkpoint":
      return `${actor} token checkpoint`;
    case "worker.completed":
      return `${actor} completed`;
    case "worker.blocked":
      return `${actor} blocked${event.reason ? ` · ${event.reason}` : ""}`;
    case "verification.started":
      return `${actor} verifying · ${event.verification?.name ?? "check"}`;
    case "verification.completed":
      return `${event.verification?.name ?? "Verification"} ${event.verification?.result ?? "UNKNOWN"}`;
    case "telemetry.warning":
      return event.reason ?? "Telemetry warning";
  }
}

function appendTimeline(state: StudioState, event: StudioEvent, tier: WorkerTier | undefined): void {
  const entry: TimelineEntry = {
    id: event.id,
    timestamp: event.timestamp,
    type: event.type,
    tier,
    label: timelineLabel(event, tier),
    tone: toneFor(event),
  };
  state.timeline = [...state.timeline, entry].slice(-120);
}

function updateWorkstation(
  state: StudioState,
  tier: WorkerTier,
  update: (workstation: WorkstationState) => WorkstationState,
  eventId: string,
): void {
  const current = state.workstations[tier];
  state.workstations = {
    ...state.workstations,
    [tier]: {
      ...update(current),
      recentEventIds: [...current.recentEventIds, eventId].slice(-20),
    },
  };
}

function isConfirmedExecution(event: StudioEvent): boolean {
  return event.evidence.confirmed && event.evidence.kind !== "replay"
    ? true
    : event.evidence.confirmed && event.evidence.kind === "replay";
}

export function applyStudioEvent(previous: StudioState, event: StudioEvent): StudioState {
  const state: StudioState = {
    ...previous,
    eventCount: previous.eventCount + 1,
    lastUpdatedAt: event.timestamp,
  };
  const tier = eventTier(event);
  appendTimeline(state, event, tier);

  switch (event.type) {
    case "run.started": {
      if (!event.actor || event.actor.role !== "parent" || !isConfirmedExecution(event)) break;
      state.runId = event.task?.id ?? event.evidence.sessionId ?? event.actor.id;
      state.startedAt = event.timestamp;
      state.completedAt = undefined;
      state.overallStatus = "RUNNING";
      state.parentModel = event.actor.model;
      state.parentEffort = event.actor.effort;
      updateWorkstation(
        state,
        "parent",
        (workstation) => ({
          ...workstation,
          status: event.status ?? "THINKING",
          actorId: event.actor?.id,
          runtimeModel: event.actor?.model,
          effort: event.actor?.effort,
          task: event.task?.summary,
          startedAt: event.timestamp,
          endedAt: undefined,
          settleAt: undefined,
          tokens: undefined,
        }),
        event.id,
      );
      break;
    }
    case "routing.recommended":
      // Recommendations are deliberately timeline-only. They are not runtime execution evidence.
      break;
    case "routing.transition":
      state.route = `${event.fromTier ?? "?"} → ${event.toTier ?? "?"}`;
      break;
    case "task.queued":
      if (event.task?.summary) state.queue = [...state.queue, event.task.summary].slice(-12);
      break;
    case "worker.spawned": {
      if (!event.actor || event.actor.role !== "worker" || !isConfirmedExecution(event)) break;
      const workerTier = modelToTier(event.actor.model);
      if (!workerTier) {
        state.warnings = [...state.warnings, `Unmapped runtime model: ${event.actor.model ?? "unknown"}`].slice(-20);
        break;
      }
      state.overallStatus = "RUNNING";
      updateWorkstation(
        state,
        workerTier,
        (workstation) => ({
          ...workstation,
          status: event.status ?? "WORKING",
          actorId: event.actor?.id,
          runtimeModel: event.actor?.model,
          effort: event.actor?.effort,
          task: event.task?.summary,
          startedAt: event.timestamp,
          endedAt: undefined,
          settleAt: undefined,
          tokens: undefined,
        }),
        event.id,
      );
      break;
    }
    case "worker.status": {
      if (!tier || !event.actor || !event.status || !isConfirmedExecution(event)) break;
      const current = state.workstations[tier];
      if (current.actorId !== event.actor.id) break;
      updateWorkstation(state, tier, (workstation) => ({ ...workstation, status: event.status as WorkerStatus }), event.id);
      break;
    }
    case "worker.token_checkpoint": {
      if (!tier || !event.actor || !event.tokens || !isConfirmedExecution(event)) break;
      const current = state.workstations[tier];
      if (current.actorId !== event.actor.id) break;
      updateWorkstation(
        state,
        tier,
        (workstation) => ({ ...workstation, tokens: mergeTokens(workstation.tokens, event.tokens) }),
        event.id,
      );
      break;
    }
    case "worker.completed":
    case "worker.blocked": {
      if (!tier || !event.actor || !isConfirmedExecution(event)) break;
      const current = state.workstations[tier];
      if (current.actorId !== event.actor.id) break;
      const blocked = event.type === "worker.blocked";
      const endedAt = event.timestamp;
      updateWorkstation(
        state,
        tier,
        (workstation) => ({
          ...workstation,
          status: blocked ? "BLOCKED" : "DONE",
          endedAt,
          settleAt: blocked ? undefined : new Date(Date.parse(endedAt) + DONE_HOLD_MS).toISOString(),
          lastRun: {
            actorId: workstation.actorId ?? event.actor?.id ?? "unknown",
            runtimeModel: workstation.runtimeModel,
            effort: workstation.effort,
            task: workstation.task,
            startedAt: workstation.startedAt,
            endedAt,
            tokens: workstation.tokens,
          },
        }),
        event.id,
      );
      if (blocked) state.overallStatus = "BLOCKED";
      break;
    }
    case "verification.started": {
      if (!event.actor || event.actor.role !== "parent" || !isConfirmedExecution(event)) break;
      updateWorkstation(state, "parent", (workstation) => ({ ...workstation, status: "VERIFYING" }), event.id);
      break;
    }
    case "verification.completed": {
      if (!event.actor || event.actor.role !== "parent" || !isConfirmedExecution(event)) break;
      const status: WorkerStatus = event.verification?.result === "FAIL" ? "BLOCKED" : "WORKING";
      updateWorkstation(state, "parent", (workstation) => ({ ...workstation, status }), event.id);
      if (status === "BLOCKED") state.overallStatus = "BLOCKED";
      break;
    }
    case "run.completed": {
      if (!event.actor || event.actor.role !== "parent" || !isConfirmedExecution(event)) break;
      state.overallStatus = "DONE";
      state.completedAt = event.timestamp;
      updateWorkstation(
        state,
        "parent",
        (workstation) => ({ ...workstation, status: "DONE", endedAt: event.timestamp }),
        event.id,
      );
      break;
    }
    case "telemetry.warning":
      if (event.reason) state.warnings = [...state.warnings, event.reason].slice(-20);
      break;
  }

  return state;
}

export function advanceStudioClock(previous: StudioState, now: number): StudioState {
  let changed = false;
  const workstations = { ...previous.workstations };

  for (const tier of WORKER_TIERS) {
    const workstation = previous.workstations[tier];
    if (!workstation.settleAt || Date.parse(workstation.settleAt) > now) continue;
    changed = true;
    workstations[tier] = {
      ...workstation,
      status: "IDLE",
      actorId: undefined,
      task: undefined,
      startedAt: undefined,
      endedAt: undefined,
      settleAt: undefined,
      tokens: undefined,
    };
  }

  return changed
    ? { ...previous, workstations, lastUpdatedAt: new Date(now).toISOString() }
    : previous;
}

export function formatTokenValue(value: number | undefined): string {
  return value === undefined ? "NOT EXPOSED" : new Intl.NumberFormat("en-US").format(value);
}
