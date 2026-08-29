import { formatTokenValue } from "../state/studio-state.js";
import { WORKER_TIERS, type StudioState, type WorkerTier, type WorkstationState } from "../shared/types.js";

interface WorkstationPresentation {
  art: string;
  shortLabel: string;
  role: string;
}

export const WORKSTATION_PRESENTATION: Record<WorkerTier, WorkstationPresentation> = {
  parent: {
    art: "/assets/studio/parent/parent-planning.webp",
    shortLabel: "Parent",
    role: "Orchestrator",
  },
  spark: {
    art: "/assets/studio/spark/spark-working.webp",
    shortLabel: "Spark",
    role: "Fast UI & code",
  },
  terra: {
    art: "/assets/studio/terra/terra-working.webp",
    shortLabel: "Terra",
    role: "General implementation",
  },
  luna: {
    art: "/assets/studio/luna/luna-thinking.webp",
    shortLabel: "Luna",
    role: "Debug & integration",
  },
  "gpt-5.5": {
    art: "/assets/studio/gpt55/gpt55-idle.webp",
    shortLabel: "GPT-5.5",
    role: "Standby specialist",
  },
  sol: {
    art: "/assets/studio/sol/sol-verifying.webp",
    shortLabel: "Sol",
    role: "Architecture & review",
  },
};

export function escapeHtml(value: string | undefined): string {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatElapsed(start: string | undefined, end: string | undefined, now = Date.now()): string {
  if (!start) return "NOT EXPOSED";
  const elapsed = Math.max(0, (end ? Date.parse(end) : now) - Date.parse(start));
  const seconds = Math.floor(elapsed / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

export function presentationClock(state: StudioState, wallClock = Date.now()): number {
  return state.mode === "replay" ? Date.parse(state.lastUpdatedAt) : wallClock;
}

function activeTask(workstation: WorkstationState): string {
  return workstation.actorId && workstation.task ? workstation.task : "No active assignment";
}

function activeModel(workstation: WorkstationState): { label: string; value: string } {
  if (workstation.actorId) {
    return { label: "Runtime", value: workstation.runtimeModel ?? "NOT EXPOSED" };
  }
  if (workstation.lastRun?.runtimeModel) {
    return { label: "Last run", value: workstation.lastRun.runtimeModel };
  }
  return { label: "Runtime", value: "NOT EXPOSED" };
}

function stateGlyph(status: WorkstationState["status"]): string {
  switch (status) {
    case "WORKING":
      return "⌁";
    case "THINKING":
      return "•••";
    case "WAITING":
      return "◷";
    case "VERIFYING":
    case "DONE":
      return "✓";
    case "BLOCKED":
      return "!";
    case "IDLE":
      return "○";
  }
}

export function renderWorkstation(workstation: WorkstationState, selected: boolean, now = Date.now()): string {
  const presentation = WORKSTATION_PRESENTATION[workstation.tier];
  const task = activeTask(workstation);
  const model = activeModel(workstation);
  const effort = workstation.actorId
    ? workstation.effort ?? "NOT EXPOSED"
    : workstation.lastRun?.effort ?? "NOT EXPOSED";
  const elapsed = workstation.actorId
    ? formatElapsed(workstation.startedAt, workstation.endedAt, now)
    : "—";
  const tokens = workstation.actorId ? workstation.tokens : workstation.lastRun?.tokens;
  const taskLabel = workstation.status === "DONE" ? "Completed task" : "Current task";

  return `
    <button class="workstation tier-${workstation.tier.replace(".", "-")} status-${workstation.status.toLowerCase()}${selected ? " selected" : ""}"
      data-tier="${workstation.tier}" aria-pressed="${selected}" aria-label="${escapeHtml(presentation.shortLabel)}, ${workstation.status}">
      <span class="workstation-heading">
        <span class="worker-identity">
          <span class="model-mark" aria-hidden="true">${presentation.shortLabel.slice(0, 1)}</span>
          <span><strong>${escapeHtml(presentation.shortLabel)}</strong><small>${escapeHtml(presentation.role)}</small></span>
        </span>
        <strong class="status-badge"><i></i>${workstation.status}</strong>
      </span>
      <span class="workstation-art" aria-hidden="true">
        <img src="${presentation.art}" alt="" width="960" height="600" loading="eager" />
        <span class="state-wash"></span>
        <span class="state-signal"><b>${stateGlyph(workstation.status)}</b><span>${workstation.status === "IDLE" ? "Ready for a task" : workstation.status.toLowerCase()}</span></span>
        <span class="verification-scan"></span>
      </span>
      <span class="workstation-meta">
        <span class="task-copy"><small>${taskLabel}</small><strong>${escapeHtml(task)}</strong></span>
        <span class="metric-copy"><small>Tokens</small><strong>${formatTokenValue(tokens?.total)}</strong></span>
      </span>
      <span class="runtime-row">
        <span><small>${model.label}</small>${escapeHtml(model.value)}</span>
        <span><small>Effort</small>${escapeHtml(effort)}</span>
        <span><small>Elapsed</small>${elapsed}</span>
      </span>
    </button>`;
}

function latestRoutingDetail(state: StudioState, tier: WorkerTier): string | undefined {
  return state.timeline
    .filter(
      (entry) =>
        entry.type === "routing.transition" &&
        (entry.tier === tier || entry.label.toLowerCase().includes(tier.toLowerCase())),
    )
    .at(-1)?.label;
}

function latestVerification(state: StudioState, tier: WorkerTier): string | undefined {
  return state.timeline
    .filter((entry) => entry.tier === tier && entry.type === "verification.completed")
    .at(-1)?.label;
}

export function renderInspector(state: StudioState, tier: WorkerTier, now = Date.now()): string {
  const worker = state.workstations[tier];
  const presentation = WORKSTATION_PRESENTATION[tier];
  const snapshot = worker.actorId ? worker : worker.lastRun;
  const model = worker.runtimeModel ?? worker.lastRun?.runtimeModel;
  const effort = worker.effort ?? worker.lastRun?.effort;
  const startedAt = worker.startedAt ?? worker.lastRun?.startedAt;
  const endedAt = worker.endedAt ?? worker.lastRun?.endedAt;
  const tokens = worker.tokens ?? worker.lastRun?.tokens;
  const workerEvents = state.timeline.filter((entry) => entry.tier === tier).slice(-8).reverse();
  const handoff = latestRoutingDetail(state, tier);
  const verification = latestVerification(state, tier);

  return `
    <div class="inspector-title">
      <span><small>WORKSTATION DETAIL</small><h2>${escapeHtml(presentation.shortLabel)}</h2><p>${escapeHtml(presentation.role)}</p></span>
      <strong class="inspector-status status-${worker.status.toLowerCase()}">${worker.status}</strong>
    </div>
    <dl class="facts">
      <div><dt>Tier</dt><dd>${escapeHtml(tier)}</dd></div>
      <div><dt>Runtime model</dt><dd>${escapeHtml(model ?? "NOT EXPOSED")}</dd></div>
      <div><dt>Reasoning effort</dt><dd>${escapeHtml(effort ?? "NOT EXPOSED")}</dd></div>
      <div><dt>Assignment</dt><dd>${escapeHtml(worker.task ?? worker.lastRun?.task ?? "No active assignment")}</dd></div>
      <div><dt>Handoff / escalation</dt><dd>${escapeHtml(handoff ?? state.route ?? "NOT EXPOSED")}</dd></div>
      <div><dt>Verification result</dt><dd>${escapeHtml(verification ?? "NOT EXPOSED")}</dd></div>
      <div><dt>Elapsed</dt><dd>${formatElapsed(startedAt, endedAt, now)}</dd></div>
      <div><dt>Started</dt><dd>${startedAt ? new Date(startedAt).toLocaleTimeString() : "NOT EXPOSED"}</dd></div>
      <div><dt>Ended</dt><dd>${endedAt ? new Date(endedAt).toLocaleTimeString() : "NOT EXPOSED"}</dd></div>
    </dl>
    <div class="usage-block">
      <span class="section-kicker">KNOWN TOKEN CHECKPOINT</span>
      <div class="usage-grid">
        <span><small>INPUT</small><strong>${formatTokenValue(tokens?.input)}</strong></span>
        <span><small>CACHED</small><strong>${formatTokenValue(tokens?.cachedInput)}</strong></span>
        <span><small>OUTPUT</small><strong>${formatTokenValue(tokens?.output)}</strong></span>
        <span><small>TOTAL</small><strong>${formatTokenValue(tokens?.total)}</strong></span>
      </div>
      <p>Missing usage remains <b>NOT EXPOSED</b>. The Studio never substitutes zero or an estimate.</p>
    </div>
    <div class="worker-log">
      <span class="section-kicker">RECENT EVIDENCE</span>
      ${workerEvents.length > 0 ? workerEvents.map((entry) => `<p><time>${new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>${escapeHtml(entry.label)}</p>`).join("") : "<p class=\"empty-row\">No runtime events for this workstation.</p>"}
    </div>
    ${snapshot ? "<p class=\"truth-note\"><i></i> Runtime-confirmed evidence only</p>" : "<p class=\"truth-note muted\"><i></i> No execution evidence</p>"}`;
}

export function renderTaskOverview(state: StudioState): string {
  const active = WORKER_TIERS.filter((tier) => !["IDLE", "DONE"].includes(state.workstations[tier].status)).length;
  const idle = WORKER_TIERS.filter((tier) => state.workstations[tier].status === "IDLE").length;
  const completed = state.timeline.filter((entry) => entry.type === "worker.completed").length;
  const knownTotals = WORKER_TIERS.map((tier) => state.workstations[tier].tokens?.total).filter(
    (value): value is number => value !== undefined,
  );
  const checkpointTotal = knownTotals.length > 0 ? knownTotals.reduce((sum, value) => sum + value, 0) : undefined;

  return `
    <div class="overview-heading"><span><small>RUN EVIDENCE</small><h2>Task Overview</h2></span><strong>${state.overallStatus}</strong></div>
    <dl class="overview-list">
      <div><dt>Active workers</dt><dd>${active}</dd></div>
      <div><dt>Idle workers</dt><dd>${idle}</dd></div>
      <div><dt>Completed workers</dt><dd>${completed}</dd></div>
      <div><dt>Progress</dt><dd>NOT EXPOSED</dd></div>
      <div><dt>Complexity</dt><dd>NOT EXPOSED</dd></div>
      <div><dt>Risk</dt><dd>NOT EXPOSED</dd></div>
      <div><dt>Known token checkpoint</dt><dd>${formatTokenValue(checkpointTotal)}</dd></div>
    </dl>
    <p class="overview-note">No estimates are shown. Counts come only from normalized runtime events.</p>`;
}

export type NavigationView = "studio" | "log" | "pool" | "rules" | "settings";

export function renderNavigationView(view: Exclude<NavigationView, "studio">, state: StudioState): string {
  if (view === "log") {
    return `<section class="section-page"><header><small>ACTUAL EVENTS</small><h2>Task Log</h2><p>Sanitized runtime and router evidence for this run.</p></header><div class="full-log">${state.timeline.length > 0 ? state.timeline.slice().reverse().map((entry) => `<article class="tone-${entry.tone}"><i></i><time>${new Date(entry.timestamp).toLocaleString()}</time><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.type)}</small></article>`).join("") : "<p class=\"empty-section\">No runtime events have been observed.</p>"}</div></section>`;
  }

  if (view === "pool") {
    return `<section class="section-page"><header><small>RUNTIME-EVIDENCE VIEW</small><h2>Model Pool</h2><p>Availability is not inferred from a tier existing in the router policy.</p></header><div class="pool-list">${WORKER_TIERS.map((tier) => {
      const worker = state.workstations[tier];
      const presentation = WORKSTATION_PRESENTATION[tier];
      const model = worker.runtimeModel ?? worker.lastRun?.runtimeModel ?? "NOT EXPOSED";
      return `<article><span class="model-mark tier-${tier.replace(".", "-")}">${presentation.shortLabel.slice(0, 1)}</span><span><strong>${escapeHtml(presentation.shortLabel)}</strong><small>${escapeHtml(presentation.role)}</small></span><span><small>Runtime model</small><strong>${escapeHtml(model)}</strong></span><b class="status-${worker.status.toLowerCase()}">${worker.status}</b></article>`;
    }).join("")}</div></section>`;
  }

  if (view === "rules") {
    return `<section class="section-page"><header><small>QUALITY-AWARE POLICY</small><h2>Routing Rules</h2><p>Observability never changes routing quality, retries, or verification.</p></header><ol class="rules-list"><li><b>Spark</b><span>Bounded, low-risk, directly verifiable work.</span></li><li><b>Terra</b><span>Ordinary implementation in an established architecture.</span></li><li><b>Luna</b><span>Complex debugging, integration, and state synchronization.</span></li><li><b>GPT-5.5</b><span>Evidence-based fallback or specialist, not a mandatory rung.</span></li><li><b>Sol</b><span>Architecture, critical correctness, security, and high blast radius.</span></li></ol><p class="policy-callout">Recommendation ≠ execution. Only a confirmed worker rollout activates a workstation.</p></section>`;
  }

  return `<section class="section-page"><header><small>LOCAL OBSERVABILITY</small><h2>Settings</h2><p>Studio behavior for this runtime session.</p></header><dl class="settings-list"><div><dt>Telemetry binding</dt><dd>localhost only</dd></div><div><dt>Prompt and source display</dt><dd>excluded by default</dd></div><div><dt>Quota telemetry</dt><dd>NOT EXPOSED</dd></div><div><dt>Mode</dt><dd>${state.mode === "replay" ? "Sanitized replay" : "Live runtime"}</dd></div><div><dt>Motion</dt><dd>Respects system reduced-motion preference</dd></div></dl></section>`;
}

export function overallLabel(state: StudioState): string {
  if (state.mode === "replay") return "SANITIZED REPLAY";
  return state.overallStatus === "IDLE" ? "AWAITING RUNTIME" : "LIVE RUNTIME";
}
