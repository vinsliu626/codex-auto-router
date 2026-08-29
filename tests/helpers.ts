import {
  STUDIO_SCHEMA_VERSION,
  type RuntimeActor,
  type StudioEvent,
  type StudioEventType,
} from "../src/shared/types.js";

let sequence = 0;

export function actor(
  role: RuntimeActor["role"],
  model: string,
  id = `${role}-${model}`,
): RuntimeActor {
  return { id, role, model, effort: role === "parent" ? "xhigh" : "low" };
}

export function studioEvent(
  type: StudioEventType,
  details: Partial<StudioEvent> = {},
): StudioEvent {
  sequence += 1;
  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    id: `test-${sequence}`,
    timestamp: new Date(1_700_000_000_000 + sequence * 1_000).toISOString(),
    type,
    evidence: { kind: "replay", confirmed: true, runtimeEvent: type },
    ...details,
  };
}
