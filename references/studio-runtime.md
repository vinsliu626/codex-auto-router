# Router Studio runtime contract

Router Studio is an observability module. It never decides which model should execute and never changes the Auto Router quality policy.

## Truth boundary

The Studio distinguishes planning evidence from execution evidence:

| Evidence | May update timeline/route? | May activate a worker? |
|---|---:|---:|
| Router recommendation | Yes | No |
| Worker spawn request | Yes | No |
| Spawn acknowledgement without worker model context | Yes | No |
| Child rollout with subagent parent identity plus `turn_context` model | Yes | Yes |
| Studio-managed worker process plus its own `turn_context` model | Yes | Yes |
| Sanitized replay event marked confirmed | Yes | Yes, in replay mode only |
| Lifecycle bridge request | Yes | No |

The state model derives the workstation tier from the confirmed runtime model ID. A caller-provided tier cannot override a conflicting runtime model.

## Normalized event interface

Every event has:

- schema version, unique ID, and timestamp;
- event type;
- sanitized actor identity, role, model, and effort when exposed;
- explicit evidence kind and confirmation flag;
- optional sanitized task summary, transition reason, status, verification result, or token checkpoint.

Supported lifecycle events cover run start/completion, recommendations, route transitions, queue entries, worker spawn/status/token/completion/block, parent verification, and telemetry warnings.

The normalized interface is the only interface consumed by the reducer and UI. Adapters own source-specific parsing.

## Codex rollout evidence

The live adapter currently consumes these persisted JSONL records when present:

- `session_meta`: runtime session ID and child `source.subagent.thread_spawn.parent_thread_id` identity;
- `turn_context`: exact model ID, reasoning effort, and turn identity;
- `event_msg.task_started`: reliable run start time;
- `event_msg.agent_reasoning`: `THINKING` status;
- function/custom tool calls: `WORKING`, `WAITING`, or parent `VERIFYING` classification;
- tool outputs: verification completion only when an exit result is exposed;
- `event_msg.token_count`: exact checkpoint fields exposed by the runtime;
- `event_msg.task_complete`: completion;
- `event_msg.turn_aborted`: blocked/aborted state.

Forked child rollouts can contain inherited parent history. The adapter records the child spawn timestamp and ignores older inherited contexts so a parent's model cannot be mistaken for the child's executing model.

Live child discovery is intentionally conservative: it watches JSONL siblings of the selected parent rollout and attaches only child files whose subagent metadata names that exact parent session. The runtime validator can also attach an explicitly launched worker process, but still waits for that process's own rollout to confirm the requested model.

## State transitions

Worker lifecycle:

```text
IDLE -> WORKING <-> THINKING / WAITING / VERIFYING
                    |                    |
                    +------> BLOCKED <---+
                    |
                    +------> DONE -> IDLE
```

`DONE` is held for two seconds so completion is visible before returning to idle. The last sanitized run snapshot remains available in the inspector after the bay is idle.

A blocked worker stays blocked until a later confirmed runtime transition replaces it. Recommendations never clear or activate a workstation.

## Token accounting

Token fields are optional independent values: input, cached input, output, reasoning output, and total. Checkpoints merge only fields actually exposed. Missing fields remain absent and render as `NOT EXPOSED`.

The Studio does not infer totals, convert missing values to zero, or claim a checkpoint represents whole-task usage.

## Local transport

The server:

- accepts only `127.0.0.1`, `::1`, or `localhost` binds;
- streams state over same-origin SSE;
- applies restrictive response headers and no CORS allowance;
- limits event request bodies;
- requires a random ephemeral token for lifecycle writes;
- rejects lifecycle-bridge worker execution events;
- writes connection details to a Git-ignored file and removes it on clean shutdown.

## Privacy

The rollout adapter does not display user messages, assistant messages, reasoning text, source code, tool commands, tool output, environment variables, or raw prompts. Tool input is inspected only in memory to classify well-known verification commands; it is never placed into Studio events.

Optional task summaries and transition reasons are whitespace-normalized, length-limited, and redacted for common credentials/tokens before entering the store. Do not place sensitive content in these fields.

Replay fixtures must contain invented/sanitized task text and non-sensitive session IDs.

## Native window behavior

The project does not have an interface for creating a native Codex popup. `start` launches the strongest honest equivalent: a localhost Studio server plus an attempted ordinary browser open on Windows, macOS, or Linux. Headless systems should use `--no-open` and the printed URL.
