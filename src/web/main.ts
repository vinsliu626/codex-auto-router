import "./style.css";
import { WORKER_TIERS, type StudioState, type WorkerTier } from "../shared/types.js";
import {
  escapeHtml,
  overallLabel,
  presentationClock,
  renderInspector,
  renderNavigationView,
  renderTaskOverview,
  renderWorkstation,
  type NavigationView,
} from "./view.js";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) throw new Error("Missing #app root");
const root: HTMLDivElement = rootElement;

let state: StudioState | undefined;
let selectedTier: WorkerTier | undefined;
let currentView: NavigationView = "studio";
let connected = false;

function navIcon(name: NavigationView): string {
  const paths: Record<NavigationView, string> = {
    studio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9 20v-6h6v6"/>',
    log: '<path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 15h6"/>',
    pool: '<circle cx="12" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="m10 9-2.5 5M14 9l2.5 5M9 17h6"/>',
    rules: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/><path d="M4 12h4M12 12h8"/><circle cx="10" cy="12" r="2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

root.innerHTML = `
  <main class="studio-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"><i></i></span>
        <span><small>Codex Auto Router</small><h1>Router Studio</h1></span>
      </div>
      <span class="connection-chip"><i></i><b id="connection-label">Connecting</b></span>
      <div class="task-context"><small>Task</small><strong id="task-label">Awaiting runtime task</strong></div>
      <div class="header-control parent-control"><small>Parent model</small><strong id="parent-model">NOT EXPOSED</strong><em id="parent-effort">NOT EXPOSED</em></div>
      <div class="header-control routing-control"><small>Routing mode</small><strong id="routing-mode">Auto Router</strong><em id="route-label">NO TRANSITION</em></div>
      <div class="overall"><small>Overall status</small><strong id="overall-status">IDLE</strong></div>
    </header>
    <div class="app-body">
      <nav class="side-nav" aria-label="Router Studio sections">
        <div class="nav-stack">
          <button class="nav-item active" data-view="studio">${navIcon("studio")}<span>Studio</span></button>
          <button class="nav-item" data-view="log">${navIcon("log")}<span>Task Log</span></button>
          <button class="nav-item" data-view="pool">${navIcon("pool")}<span>Model Pool</span></button>
          <button class="nav-item" data-view="rules">${navIcon("rules")}<span>Routing Rules</span></button>
          <button class="nav-item" data-view="settings">${navIcon("settings")}<span>Settings</span></button>
        </div>
        <div class="quota-note"><small>Quota telemetry</small><strong>NOT EXPOSED</strong></div>
      </nav>
      <section class="studio-main">
        <div class="workspace-heading">
          <span><small>LIVE WORKSPACE</small><h2 id="workspace-title">AI Workspace Studio</h2><p id="workspace-subtitle">Actual workers only. Recommendations never activate a desk.</p></span>
          <strong class="worker-counts"><i></i><span id="model-count">6 models</span><b>·</b><span id="active-count">0 active</span><b>·</b><span id="idle-count">6 idle</span></strong>
        </div>
        <div class="workspace-stage">
          <div class="studio-view" id="studio-view">
            <div class="studio-floor" id="studio-floor" aria-live="polite"></div>
            <div class="route-strip" id="route-strip" hidden></div>
            <section class="task-queue" aria-label="Task queue">
              <span><small>TASK QUEUE</small><strong id="queue-summary">No queued tasks</strong></span>
              <div class="queue-items" id="queue-items"></div>
            </section>
          </div>
          <div class="section-view" id="section-view" hidden></div>
        </div>
      </section>
      <aside class="right-rail">
        <section class="activity-panel">
          <div class="panel-heading"><span><small>ACTUAL EVENTS</small><h2>Live Activity</h2></span><strong id="event-count">0</strong></div>
          <div class="timeline" id="timeline"></div>
        </section>
        <section class="context-panel" id="context-panel"></section>
      </aside>
    </div>
    <footer><span><i></i> Localhost-only telemetry</span><span>Prompts, source, secrets, and credentials are excluded by default.</span><span id="last-update">NO EVENTS</span></footer>
  </main>`;

function query<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const floor = query<HTMLDivElement>("#studio-floor");
const timeline = query<HTMLDivElement>("#timeline");
const studioView = query<HTMLDivElement>("#studio-view");
const sectionView = query<HTMLDivElement>("#section-view");
const contextPanel = query<HTMLElement>("#context-panel");

function renderTimeline(current: StudioState): string {
  if (current.timeline.length === 0) {
    return '<p class="empty-feed">Runtime evidence will appear here.<br />Idle means no confirmed execution.</p>';
  }
  return current.timeline
    .slice(-24)
    .reverse()
    .map(
      (entry) => `<div class="timeline-row tone-${entry.tone}"><i></i><time>${new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><p>${escapeHtml(entry.label)}</p></div>`,
    )
    .join("");
}

function render(): void {
  if (!state) return;
  const current = state;
  const now = presentationClock(current);
  const activeTiers = WORKER_TIERS.filter((tier) => !["IDLE", "DONE"].includes(current.workstations[tier].status));
  const idleTiers = WORKER_TIERS.filter((tier) => current.workstations[tier].status === "IDLE");
  const parent = current.workstations.parent;

  floor.innerHTML = WORKER_TIERS.map((tier) =>
    renderWorkstation(current.workstations[tier], tier === selectedTier, now),
  ).join("");
  timeline.innerHTML = renderTimeline(current);

  if (selectedTier) {
    contextPanel.innerHTML = `<button class="overview-back" id="inspector-close" type="button">← Task overview</button>${renderInspector(current, selectedTier, now)}`;
    contextPanel.classList.add("showing-inspector");
  } else {
    contextPanel.innerHTML = renderTaskOverview(current);
    contextPanel.classList.remove("showing-inspector");
  }

  query<HTMLElement>("#connection-label").textContent = connected ? overallLabel(current) : "RECONNECTING";
  query<HTMLElement>("#task-label").textContent = parent.actorId && parent.task ? parent.task : "Awaiting runtime task";
  query<HTMLElement>("#parent-model").textContent = current.parentModel ?? "NOT EXPOSED";
  query<HTMLElement>("#parent-effort").textContent = current.parentEffort ?? "NOT EXPOSED";
  query<HTMLElement>("#routing-mode").textContent = current.mode === "replay" ? "Replay mode" : "Auto Router";
  query<HTMLElement>("#route-label").textContent = current.route ?? "NO TRANSITION";
  query<HTMLElement>("#overall-status").textContent = current.overallStatus;
  query<HTMLElement>("#overall-status").className = `overall-${current.overallStatus.toLowerCase()}`;
  query<HTMLElement>("#event-count").textContent = String(current.eventCount);
  query<HTMLElement>("#active-count").textContent = `${activeTiers.length} active`;
  query<HTMLElement>("#idle-count").textContent = `${idleTiers.length} idle`;

  const queueItems = query<HTMLElement>("#queue-items");
  query<HTMLElement>("#queue-summary").textContent = current.queue.length > 0
    ? `${current.queue.length} queued task${current.queue.length === 1 ? "" : "s"}`
    : "No queued tasks";
  queueItems.innerHTML = current.queue
    .slice(0, 4)
    .map((task, index) => `<span><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(task)}</span>`)
    .join("");

  const routeStrip = query<HTMLElement>("#route-strip");
  routeStrip.hidden = !current.route;
  routeStrip.innerHTML = current.route
    ? `<small>ROUTING TRANSITION</small><strong>${escapeHtml(current.route)}</strong><span>${escapeHtml(current.timeline.filter((entry) => entry.type === "routing.transition").at(-1)?.label ?? "Runtime route updated")}</span>`
    : "";

  studioView.hidden = currentView !== "studio";
  sectionView.hidden = currentView === "studio";
  if (currentView !== "studio") {
    sectionView.innerHTML = renderNavigationView(currentView, current);
  }
  root.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
    button.setAttribute("aria-current", button.dataset.view === currentView ? "page" : "false");
  });
  query<HTMLElement>("#workspace-title").textContent = currentView === "studio"
    ? "AI Workspace Studio"
    : root.querySelector<HTMLElement>(`[data-view="${currentView}"] span`)?.textContent ?? "Router Studio";
  query<HTMLElement>("#workspace-subtitle").textContent = currentView === "studio"
    ? "Actual workers only. Recommendations never activate a desk."
    : "Local, sanitized, evidence-first observability.";
  query<HTMLElement>("#last-update").textContent = `UPDATED ${new Date(current.lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

root.addEventListener("click", (clickEvent) => {
  const target = clickEvent.target as HTMLElement;
  const bay = target.closest<HTMLElement>("[data-tier]");
  const tier = bay?.dataset.tier;
  if (tier && WORKER_TIERS.includes(tier as WorkerTier)) {
    selectedTier = tier as WorkerTier;
    render();
    return;
  }

  const navItem = target.closest<HTMLElement>("[data-view]");
  const view = navItem?.dataset.view;
  if (view && ["studio", "log", "pool", "rules", "settings"].includes(view)) {
    currentView = view as NavigationView;
    render();
    return;
  }

  if (target.closest("#inspector-close")) {
    selectedTier = undefined;
    render();
  }
});

async function connect(): Promise<void> {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error(`State request failed: ${response.status}`);
  state = (await response.json()) as StudioState;
  connected = true;
  render();

  const source = new EventSource("/api/events");
  source.addEventListener("open", () => {
    connected = true;
    render();
  });
  source.addEventListener("error", () => {
    connected = false;
    render();
  });
  source.addEventListener("state", (message) => {
    state = JSON.parse((message as MessageEvent<string>).data) as StudioState;
    render();
  });
  source.addEventListener("update", (message) => {
    const update = JSON.parse((message as MessageEvent<string>).data) as { state: StudioState };
    state = update.state;
    render();
  });
}

void connect().catch(() => {
  connected = false;
  query<HTMLElement>("#connection-label").textContent = "OFFLINE";
});

setInterval(render, 1_000);
