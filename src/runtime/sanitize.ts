import type { StudioEvent } from "../shared/types.js";

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|rk|pk)-[a-z0-9_-]{12,}\b/gi,
  /\b(?:ghp_|github_pat_|glpat-|xox[baprs]-)[_a-z0-9-]{10,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[a-z0-9._~+/=-]{10,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["']?[^\s,"']{4,}/gi,
];

export function sanitizeText(value: unknown, maxLength = 180): string | undefined {
  if (typeof value !== "string") return undefined;

  let sanitized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  if (!sanitized) return undefined;
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 1)}…` : sanitized;
}

export function sanitizeStudioEvent(event: StudioEvent): StudioEvent {
  const sanitizedTask = event.task
    ? {
        id: sanitizeText(event.task.id, 80),
        summary: sanitizeText(event.task.summary, 180),
      }
    : undefined;

  return {
    ...event,
    actor: event.actor
      ? {
          ...event.actor,
          id: sanitizeText(event.actor.id, 100) ?? "unknown",
          model: sanitizeText(event.actor.model, 100),
          effort: sanitizeText(event.actor.effort, 40),
          label: sanitizeText(event.actor.label, 80),
        }
      : undefined,
    task: sanitizedTask?.id || sanitizedTask?.summary ? sanitizedTask : undefined,
    reason: sanitizeText(event.reason, 180),
    verification: event.verification
      ? { ...event.verification, name: sanitizeText(event.verification.name, 100) ?? "verification" }
      : undefined,
    evidence: {
      ...event.evidence,
      sessionId: sanitizeText(event.evidence.sessionId, 100),
      parentSessionId: sanitizeText(event.evidence.parentSessionId, 100),
      runtimeEvent: sanitizeText(event.evidence.runtimeEvent, 80),
      source: sanitizeText(event.evidence.source, 120),
    },
  };
}
