import { EventEmitter } from "node:events";
import type { StudioEvent, StudioState } from "../shared/types.js";
import { sanitizeStudioEvent } from "../runtime/sanitize.js";
import { advanceStudioClock, applyStudioEvent, createInitialStudioState } from "../state/studio-state.js";

export class StudioStore {
  private emitter = new EventEmitter();
  private seenEventIds = new Set<string>();
  private _state: StudioState;
  private _events: StudioEvent[] = [];

  constructor(mode: StudioState["mode"] = "live") {
    this._state = createInitialStudioState(mode);
  }

  get state(): StudioState {
    return this._state;
  }

  get events(): readonly StudioEvent[] {
    return this._events;
  }

  publish(rawEvent: StudioEvent): boolean {
    const event = sanitizeStudioEvent(rawEvent);
    if (this.seenEventIds.has(event.id)) return false;
    this.seenEventIds.add(event.id);
    this._events = [...this._events, event];
    this._state = applyStudioEvent(this._state, event);
    this.emitter.emit("update", event, this._state);
    return true;
  }

  tick(now = Date.now()): boolean {
    const next = advanceStudioClock(this._state, now);
    if (next === this._state) return false;
    this._state = next;
    this.emitter.emit("tick", this._state);
    return true;
  }

  subscribe(listener: (event: StudioEvent | undefined, state: StudioState) => void): () => void {
    const update = (event: StudioEvent, state: StudioState) => listener(event, state);
    const tick = (state: StudioState) => listener(undefined, state);
    this.emitter.on("update", update);
    this.emitter.on("tick", tick);
    return () => {
      this.emitter.off("update", update);
      this.emitter.off("tick", tick);
    };
  }
}
