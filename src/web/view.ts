import { formatTokenValue } from "../state/studio-state.js";
import type { StudioState, WorkerTier, WorkstationState } from "../shared/types.js";

export function escapeHtml(value: string | undefined): string {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatElapsed(start: string | undefined, end: string | undefined, now = Date.now()): string {
  if (!start) return "—";
  const elapsed = Math.max(0, (end ? Date.parse(end) : now) - Date.parse(start));
  const seconds = Math.floor(elapsed / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

function characterMarkup(tier: WorkerTier): string {
  return `
    <div class="scene" aria-hidden="true">
      <span class="ambient ambient-a"></span><span class="ambient ambient-b"></span>
      <div class="window"><i></i><i></i><i></i><i></i></div>
      <div class="status-prop"><span class="zzz">Z</span><span class="check-spark">✦</span></div>
      <div class="monitor"><span class="monitor-line line-a"></span><span class="monitor-line line-b"></span><span class="monitor-line line-c"></span></div>
      <div class="desk"><span class="desk-leg left"></span><span class="desk-leg right"></span><span class="mug"></span></div>
      <div class="person person-${tier.replace(".", "-")}">
        <span class="hair"></span><span class="head"></span><span class="body"></span>
        <span class="arm arm-left"></span><span class="arm arm-right"></span><span class="chair"></span>
      </div>
      <div class="floor-shadow"></div>
    </div>`;
}

export function renderWorkstation(workstation: WorkstationState, selected: boolean, now = Date.now()): string {
  const task = workstation.task ?? workstation.lastRun?.task ?? "No active assignment";
  const model = workstation.runtimeModel ?? workstation.lastRun?.runtimeModel ?? "NOT EXPOSED";
  const elapsed = formatElapsed(
    workstation.startedAt ?? workstation.lastRun?.startedAt,
    workstation.endedAt ?? workstation.lastRun?.endedAt,
    now,
  );
  return `
    <button class="bay tier-${workstation.tier.replace(".", "-")} status-${workstation.status.toLowerCase()}${selected ? " selected" : ""}"
      data-tier="${workstation.tier}" aria-pressed="${selected}" aria-label="${escapeHtml(workstation.label)}, ${workstation.status}">
      <span class="bay-heading">
        <span><small>${workstation.tier === "parent" ? "CONTROL ROOM" : "MODEL BAY"}</small>${escapeHtml(workstation.label)}</span>
        <strong class="status-label"><i></i>${workstation.status}</strong>
      </span>
      ${characterMarkup(workstation.tier)}
      <span class="task-strip"><span>${escapeHtml(task)}</span><em>${elapsed}</em></span>
      <span class="model-id">${escapeHtml(model)}</span>
    </button>`;
}

export function renderInspector(state: StudioState, tier: WorkerTier, now = Date.now()): string {
  const worker = state.workstations[tier];
  const snapshot = worker.actorId ? worker : worker.lastRun;
  const model = worker.runtimeModel ?? worker.lastRun?.runtimeModel;
  const effort = worker.effort ?? worker.lastRun?.effort;
  const startedAt = worker.startedAt ?? worker.lastRun?.startedAt;
  const endedAt = worker.endedAt ?? worker.lastRun?.endedAt;
  const tokens = worker.tokens ?? worker.lastRun?.tokens;
  const workerEvents = state.timeline.filter((entry) => entry.tier === tier).slice(-8).reverse();
  const handoff = state.timeline
    .filter((entry) => entry.type === "routing.transition" && entry.label.includes(tier))
    .at(-1)?.label;

  return `
    <div class="inspector-title">
      <span><small>WORKSTATION DETAIL</small><h2>${escapeHtml(worker.label)}</h2></span>
      <strong class="inspector-status status-${worker.status.toLowerCase()}">${worker.status}</strong>
    </div>
    <dl class="facts">
      <div><dt>Runtime model</dt><dd>${escapeHtml(model ?? "NOT EXPOSED")}</dd></div>
      <div><dt>Reasoning effort</dt><dd>${escapeHtml(effort ?? "NOT EXPOSED")}</dd></div>
      <div><dt>Assignment</dt><dd>${escapeHtml(worker.task ?? worker.lastRun?.task ?? "No active assignment")}</dd></div>
      <div><dt>Handoff</dt><dd>${escapeHtml(handoff ?? state.route ?? "—")}</dd></div>
      <div><dt>Elapsed</dt><dd>${formatElapsed(startedAt, endedAt, now)}</dd></div>
      <div><dt>Started</dt><dd>${startedAt ? new Date(startedAt).toLocaleTimeString() : "NOT EXPOSED"}</dd></div>
      <div><dt>Ended</dt><dd>${endedAt ? new Date(endedAt).toLocaleTimeString() : "—"}</dd></div>
    </dl>
    <div class="usage-block">
      <span class="section-kicker">KNOWN TOKEN CHECKPOINT</span>
      <div class="usage-grid">
        <span><small>INPUT</small><strong>${formatTokenValue(tokens?.input)}</strong></span>
        <span><small>CACHED</small><strong>${formatTokenValue(tokens?.cachedInput)}</strong></span>
        <span><small>OUTPUT</small><strong>${formatTokenValue(tokens?.output)}</strong></span>
        <span><small>TOTAL</small><strong>${formatTokenValue(tokens?.total)}</strong></span>
      </div>
      <p>Missing usage remains <b>NOT EXPOSED</b>. The Studio never substitutes zero.</p>
    </div>
    <div class="worker-log">
      <span class="section-kicker">RECENT EVIDENCE</span>
      ${workerEvents.length > 0 ? workerEvents.map((entry) => `<p><time>${new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>${escapeHtml(entry.label)}</p>`).join("") : "<p class=\"empty-row\">No runtime events for this bay.</p>"}
    </div>
    ${snapshot ? "<p class=\"truth-note\"><i></i> Runtime-confirmed evidence only</p>" : "<p class=\"truth-note muted\"><i></i> No execution evidence</p>"}`;
}

export function overallLabel(state: StudioState): string {
  if (state.mode === "replay") return "SANITIZED REPLAY";
  return state.overallStatus === "IDLE" ? "AWAITING RUNTIME" : "LIVE RUNTIME";
}
