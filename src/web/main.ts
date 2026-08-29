import "./style.css";
import { WORKER_TIERS, type StudioState, type WorkerTier } from "../shared/types.js";
import { escapeHtml, overallLabel, renderInspector, renderWorkstation } from "./view.js";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) throw new Error("Missing #app root");
const root: HTMLDivElement = rootElement;

let state: StudioState | undefined;
let selectedTier: WorkerTier = "parent";
let connected = false;

root.innerHTML = `
  <main class="studio-shell">
    <header class="topbar">
      <div class="brand-lockup"><span class="brand-mark"><i></i><i></i><i></i></span><span><small>CODEX AUTO ROUTER</small><h1>Router Studio</h1></span></div>
      <div class="run-summary">
        <span class="live-chip"><i></i><b id="connection-label">CONNECTING</b></span>
        <span><small>PARENT</small><b id="parent-model">NOT EXPOSED</b></span>
        <span><small>EFFORT</small><b id="parent-effort">NOT EXPOSED</b></span>
        <span><small>ROUTE</small><b id="route-label">—</b></span>
      </div>
      <div class="overall"><small>OVERALL</small><strong id="overall-status">IDLE</strong></div>
    </header>
    <section class="workspace">
      <div class="floor-wrap">
        <div class="floor-label"><span>LIVE WORKSHOP / SECTOR 01</span><b id="event-count">0 EVENTS</b></div>
        <div class="studio-floor" id="studio-floor" aria-live="polite"></div>
      </div>
      <aside class="side-rail">
        <section class="inspector" id="inspector"></section>
        <section class="activity">
          <div class="rail-heading"><span><small>RUNTIME SIGNAL</small><h2>Activity feed</h2></span><b id="queue-count">QUEUE 0</b></div>
          <div class="queue-list" id="queue-list" hidden></div>
          <div class="timeline" id="timeline"></div>
        </section>
      </aside>
    </section>
    <footer><span><i></i> LOCALHOST ONLY</span><span>Prompts and source code are excluded by default</span><span id="last-update">NO EVENTS</span></footer>
  </main>`;

function query<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const floor = query<HTMLDivElement>("#studio-floor");
const inspector = query<HTMLElement>("#inspector");
const timeline = query<HTMLDivElement>("#timeline");

function render(): void {
  if (!state) return;
  const now = Date.now();
  floor.innerHTML = WORKER_TIERS.map((tier) => renderWorkstation(state!.workstations[tier], tier === selectedTier, now)).join("");
  inspector.innerHTML = renderInspector(state, selectedTier, now);
  timeline.innerHTML = state.timeline.length
    ? state.timeline
        .slice(-18)
        .reverse()
        .map(
          (entry) => `<div class="timeline-row tone-${entry.tone}"><i></i><time>${new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><p>${escapeHtml(entry.label)}</p></div>`,
        )
        .join("")
    : '<p class="empty-feed">Runtime evidence will appear here.<br />Recommendations alone never activate a worker.</p>';

  query<HTMLElement>("#connection-label").textContent = connected ? overallLabel(state) : "RECONNECTING";
  query<HTMLElement>("#parent-model").textContent = state.parentModel ?? "NOT EXPOSED";
  query<HTMLElement>("#parent-effort").textContent = state.parentEffort ?? "NOT EXPOSED";
  query<HTMLElement>("#route-label").textContent = state.route ?? "—";
  query<HTMLElement>("#overall-status").textContent = state.overallStatus;
  query<HTMLElement>("#overall-status").className = `overall-${state.overallStatus.toLowerCase()}`;
  query<HTMLElement>("#event-count").textContent = `${state.eventCount} EVENT${state.eventCount === 1 ? "" : "S"}`;
  query<HTMLElement>("#queue-count").textContent = `QUEUE ${state.queue.length}`;
  const queueList = query<HTMLElement>("#queue-list");
  queueList.hidden = state.queue.length === 0;
  queueList.innerHTML = state.queue
    .slice(0, 3)
    .map((task, index) => `<p><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(task)}</p>`)
    .join("");
  query<HTMLElement>("#last-update").textContent = `UPDATED ${new Date(state.lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

floor.addEventListener("click", (clickEvent) => {
  const bay = (clickEvent.target as HTMLElement).closest<HTMLElement>("[data-tier]");
  const tier = bay?.dataset.tier;
  if (tier && WORKER_TIERS.includes(tier as WorkerTier)) {
    selectedTier = tier as WorkerTier;
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
