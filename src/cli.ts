#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  findLatestRollout,
  findRolloutByThreadId,
  CodexRunWatcher,
  RolloutTailer,
  rolloutId,
} from "./runtime/rollout-watcher.js";
import { loadReplayFile } from "./runtime/replay.js";
import { sanitizeText } from "./runtime/sanitize.js";
import { startStudioServer, type StudioServer } from "./server/studio-server.js";
import { StudioStore } from "./server/studio-store.js";
import { DONE_HOLD_MS, advanceStudioClock } from "./state/studio-state.js";
import {
  STUDIO_SCHEMA_VERSION,
  isWorkerTier,
  type RuntimeActor,
  type StudioEvent,
  type StudioEventType,
  type WorkerTier,
} from "./shared/types.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDirectory, "..");
const defaultWebRoot = join(projectRoot, "dist", "web");
const defaultSessionRoot = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
let emergencyCleanup: (() => Promise<void>) | undefined;

type Args = Record<string, string | boolean | string[]> & { _: string[] };

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) continue;
    if (!current.startsWith("--")) {
      args._.push(current);
      continue;
    }
    const [rawKey, inlineValue] = current.slice(2).split("=", 2);
    if (!rawKey) continue;
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[rawKey] = next;
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

function stringArg(args: Args, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
}

function numberArg(args: Args, name: string, fallback: number): number {
  const value = Number(stringArg(args, name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function hasFlag(args: Args, name: string): boolean {
  return args[name] === true;
}

function event(
  type: StudioEventType,
  actor: RuntimeActor | undefined,
  details: Partial<StudioEvent> = {},
  evidenceKind: StudioEvent["evidence"]["kind"] = "verified-process",
): StudioEvent {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    id: `studio:${type}:${timestamp}:${Math.random().toString(36).slice(2, 9)}`,
    timestamp,
    type,
    actor,
    evidence: {
      kind: evidenceKind,
      confirmed: true,
      sessionId: actor?.id,
      runtimeEvent: type,
      source: "router-studio-cli",
    },
    ...details,
  };
}

function openBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? { file: "powershell.exe", args: ["-NoProfile", "-Command", "Start-Process", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function writeConnection(server: StudioServer, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ url: server.url, token: server.token }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function waitForSignal(): Promise<void> {
  await new Promise<void>((resolveSignal) => {
    process.once("SIGINT", resolveSignal);
    process.once("SIGTERM", resolveSignal);
  });
}

async function startCommand(args: Args): Promise<void> {
  if (hasFlag(args, "disabled") || process.env.CODEX_ROUTER_STUDIO === "0") {
    console.log("Codex Router Studio: disabled");
    return;
  }
  const sessionRoot = resolve(stringArg(args, "session-root") ?? defaultSessionRoot);
  const parentRollout = stringArg(args, "rollout")
    ? resolve(stringArg(args, "rollout") as string)
    : await findLatestRollout(sessionRoot);
  const port = numberArg(args, "port", 4317);
  const server = await startStudioServer({ port, webRoot: defaultWebRoot, mode: "live" });
  const connectionPath = resolve(
    stringArg(args, "connection-file") ?? join(process.cwd(), ".codex-router-studio", "connection.json"),
  );
  await writeConnection(server, connectionPath);

  let watcher: CodexRunWatcher | undefined;
  if (parentRollout) {
    watcher = new CodexRunWatcher({
      parentRollout,
      taskSummary: stringArg(args, "task"),
      onEvent: server.publish,
      onWarning: (reason) => server.publish(event("telemetry.warning", undefined, { reason })),
    });
    await watcher.start();
  } else {
    server.publish(event("telemetry.warning", undefined, { reason: "No Codex rollout found; all workers remain IDLE" }));
  }

  console.log(`Codex Router Studio: ${server.url}`);
  console.log(parentRollout ? `Runtime rollout: ${parentRollout}` : "Runtime rollout: NOT AVAILABLE");
  console.log(`Lifecycle bridge: ${connectionPath}`);
  if (!hasFlag(args, "no-open")) openBrowser(server.url);

  await waitForSignal();
  watcher?.stop();
  await server.close();
  await rm(connectionPath, { force: true });
}

async function replayCommand(args: Args): Promise<void> {
  const replayPath = resolve(args._[1] ?? stringArg(args, "file") ?? join(projectRoot, "fixtures", "spark-replay.jsonl"));
  const replay = await loadReplayFile(replayPath);
  if (replay.events.length === 0) throw new Error(`Replay contains no valid events: ${replayPath}`);

  if (hasFlag(args, "headless")) {
    const store = new StudioStore("replay");
    for (const replayEvent of replay.events) store.publish(replayEvent);
    const finalTimestamp = Date.parse(replay.events.at(-1)?.timestamp ?? new Date().toISOString());
    const finalState = advanceStudioClock(store.state, finalTimestamp + DONE_HOLD_MS + 1);
    console.log(
      JSON.stringify(
        {
          replay: replayPath,
          validEvents: replay.events.length,
          warnings: replay.warnings,
          overallStatus: finalState.overallStatus,
          sparkStatus: finalState.workstations.spark.status,
          sparkLastModel: finalState.workstations.spark.lastRun?.runtimeModel,
          exposedTokenTotal: finalState.workstations.spark.lastRun?.tokens?.total ?? "NOT EXPOSED",
        },
        null,
        2,
      ),
    );
    return;
  }

  const server = await startStudioServer({
    port: numberArg(args, "port", 4317),
    webRoot: defaultWebRoot,
    mode: "replay",
  });
  console.log(`Codex Router Studio replay: ${server.url}`);
  for (const warning of replay.warnings) server.publish(event("telemetry.warning", undefined, { reason: warning }, "replay"));
  if (!hasFlag(args, "no-open")) openBrowser(server.url);

  const speed = Math.max(0.1, numberArg(args, "speed", 4));
  const firstTimestamp = Date.parse(replay.events[0]?.timestamp ?? new Date().toISOString());
  for (const replayEvent of replay.events) {
    const delay = Math.max(0, (Date.parse(replayEvent.timestamp) - firstTimestamp) / speed);
    setTimeout(() => server.publish(replayEvent), delay);
  }
  await waitForSignal();
  await server.close();
}

async function emitCommand(args: Args): Promise<void> {
  const connectionPath = resolve(
    stringArg(args, "connection-file") ?? join(process.cwd(), ".codex-router-studio", "connection.json"),
  );
  const connection = JSON.parse(await readFile(connectionPath, "utf8")) as { url: string; token: string };
  const type = stringArg(args, "type") as StudioEventType | undefined;
  const allowed: StudioEventType[] = [
    "routing.recommended",
    "routing.transition",
    "task.queued",
    "verification.started",
    "verification.completed",
    "telemetry.warning",
  ];
  if (!type || !allowed.includes(type)) {
    throw new Error(`--type must be one of: ${allowed.join(", ")}`);
  }
  const fromTier = stringArg(args, "from");
  const toTier = stringArg(args, "to");
  if (fromTier && !isWorkerTier(fromTier)) throw new Error(`Unknown --from tier: ${fromTier}`);
  if (toTier && !isWorkerTier(toTier)) throw new Error(`Unknown --to tier: ${toTier}`);

  const bridgeEvent = event(
    type,
    {
      id: stringArg(args, "actor-id") ?? "parent-bridge",
      role: "parent",
      model: stringArg(args, "model"),
      effort: stringArg(args, "effort"),
    },
    {
      fromTier: fromTier as WorkerTier | undefined,
      toTier: toTier as WorkerTier | undefined,
      reason: stringArg(args, "reason"),
      task: stringArg(args, "task") ? { summary: stringArg(args, "task") } : undefined,
      verification: stringArg(args, "verification")
        ? {
            name: stringArg(args, "verification") as string,
            result: stringArg(args, "result") as "PASS" | "FAIL" | "UNKNOWN" | undefined,
          }
        : undefined,
    },
    "verified-bridge",
  );

  const response = await fetch(`${connection.url}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Token": connection.token },
    body: JSON.stringify(bridgeEvent),
  });
  if (!response.ok) throw new Error(`Studio rejected event: ${response.status} ${await response.text()}`);
  console.log(`Accepted ${type}`);
}

function childExit(child: ChildProcess): Promise<number> {
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

async function waitForRollout(sessionRoot: string, threadId: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const path = await findRolloutByThreadId(sessionRoot, threadId);
    if (path) return path;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for Spark rollout ${threadId}`);
}

async function runVerification(server: StudioServer, parent: RuntimeActor): Promise<number> {
  server.publish(event("verification.started", parent, { verification: { name: "Full test suite" } }));
  const child =
    process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm test"], {
          cwd: projectRoot,
          stdio: "inherit",
          windowsHide: true,
        })
      : spawn("npm", ["test"], { cwd: projectRoot, stdio: "inherit" });
  const exitCode = await childExit(child);
  server.publish(
    event("verification.completed", parent, {
      verification: { name: "Full test suite", result: exitCode === 0 ? "PASS" : "FAIL" },
    }),
  );
  return exitCode;
}

async function validateRuntimeCommand(args: Args): Promise<void> {
  const sessionRoot = resolve(stringArg(args, "session-root") ?? defaultSessionRoot);
  const parentRollout = stringArg(args, "parent-rollout")
    ? resolve(stringArg(args, "parent-rollout") as string)
    : await findLatestRollout(sessionRoot);
  if (!parentRollout) throw new Error("A parent Codex rollout is required for runtime validation");

  const server = await startStudioServer({
    port: numberArg(args, "port", 0),
    webRoot: defaultWebRoot,
    mode: "live",
  });
  const runWatcher = new CodexRunWatcher({
    parentRollout,
    taskSummary: "Validate real parent → Spark Studio evidence",
    onEvent: server.publish,
    onWarning: (reason) => server.publish(event("telemetry.warning", undefined, { reason })),
  });
  await runWatcher.start();
  const activeResources: { workerTailer?: RolloutTailer } = {};
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    activeResources.workerTailer?.stop();
    runWatcher.stop();
    await server.close();
  };
  emergencyCleanup = cleanup;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));

  const parentState = server.store.state.workstations.parent;
  if (!parentState.actorId || !parentState.runtimeModel) {
    await cleanup();
    throw new Error("Parent rollout did not expose a confirmed model");
  }
  const parent: RuntimeActor = {
    id: parentState.actorId,
    role: "parent",
    model: parentState.runtimeModel,
    effort: parentState.effort,
  };

  console.log(`Runtime validation Studio: ${server.url}`);
  console.log(`Confirmed parent: ${parent.model} / ${parent.effort ?? "effort not exposed"}`);
  if (hasFlag(args, "open")) openBrowser(server.url);

  const requestedModel = stringArg(args, "model") ?? "gpt-5.3-codex-spark";
  const requestedEffort = stringArg(args, "effort") ?? "low";
  const taskSummary = "Audit public Studio docs without editing files";
  const prompt =
    "Act as a bounded read-only worker. Inspect package.json, README.md, SKILL.md, references/studio-runtime.md, and fixtures/spark-replay.jsonl. Do not edit any file. Return four concise bullets confirming whether the documented commands, runtime-truth boundary, privacy claims, and replay fixture agree with the implementation-facing files. Name the files you checked.";
  const codex = spawn(
    "codex",
    [
      "exec",
      "--model",
      requestedModel,
      "--config",
      `model_reasoning_effort="${requestedEffort}"`,
      "--sandbox",
      "read-only",
      "--json",
      "--cd",
      projectRoot,
      prompt,
    ],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );

  let threadId: string | undefined;
  const stdout = createInterface({ input: codex.stdout });
  stdout.on("line", (line) => {
    try {
      const payload = JSON.parse(line) as { type?: string; thread_id?: string; threadId?: string };
      if (payload.type === "thread.started") threadId = payload.thread_id ?? payload.threadId;
    } catch {
      // Human-readable output is ignored; only structured runtime evidence is consumed.
    }
  });
  let stderrTail = "";
  codex.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-2_000);
  });

  const threadDeadline = Date.now() + 15_000;
  while (!threadId && Date.now() < threadDeadline && codex.exitCode === null) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  if (!threadId) {
    codex.kill();
    await cleanup();
    throw new Error(`Spark worker did not report a thread id: ${sanitizeText(stderrTail, 400) ?? "no details"}`);
  }

  const workerRollout = await waitForRollout(sessionRoot, threadId);
  const workerTailer = new RolloutTailer({
    sourcePath: workerRollout,
    actorMode: "worker",
    parentSessionId: rolloutId(parentRollout),
    actorLabel: "Spark validation worker",
    taskSummary,
    evidenceKind: "verified-process",
    intervalMs: 100,
    onEvent: server.publish,
    onWarning: (reason) => server.publish(event("telemetry.warning", undefined, { reason })),
  });
  activeResources.workerTailer = workerTailer;
  await workerTailer.start();
  const workerExitCode = await childExit(codex);
  await workerTailer.poll();
  const completion = workerTailer.adapter.processCompleted(new Date().toISOString(), workerExitCode);
  if (completion) server.publish(completion);

  const confirmedWorkerModel = workerTailer.adapter.confirmedModel;
  const confirmedWorkerEffort = workerTailer.adapter.confirmedEffort;
  if (
    workerExitCode !== 0 ||
    confirmedWorkerModel !== requestedModel ||
    confirmedWorkerEffort !== requestedEffort
  ) {
    await cleanup();
    throw new Error(
      `Spark validation failed: exit=${workerExitCode}, requested=${requestedModel}/${requestedEffort}, confirmed=${confirmedWorkerModel ?? "NOT EXPOSED"}/${confirmedWorkerEffort ?? "NOT EXPOSED"}, stderr=${sanitizeText(stderrTail, 400) ?? "none"}`,
    );
  }

  await new Promise((resolveDelay) => setTimeout(resolveDelay, DONE_HOLD_MS + 350));
  const verificationExitCode = await runVerification(server, parent);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));

  const executionEvents = server.store.events.filter(
    (candidate) =>
      candidate.actor?.role === "worker" &&
      ["worker.spawned", "worker.status", "worker.completed", "worker.blocked"].includes(candidate.type),
  );
  const activeWorkerModels = new Set(
    executionEvents.filter((candidate) => candidate.evidence.confirmed).map((candidate) => candidate.actor?.model),
  );
  const state = server.store.state;
  const checks = {
    parentVisible: state.parentModel === parent.model,
    sparkExecutionConfirmed: executionEvents.some(
      (candidate) => candidate.type === "worker.spawned" && candidate.actor?.model === requestedModel,
    ),
    sparkWorkingStateObserved: executionEvents.some(
      (candidate) =>
        candidate.actor?.model === requestedModel &&
        (candidate.type === "worker.spawned" || candidate.status === "WORKING"),
    ),
    idleModelRemainedIdle: state.workstations.terra.status === "IDLE" && !activeWorkerModels.has("gpt-5.6-terra"),
    sparkCompleted: executionEvents.some(
      (candidate) => candidate.type === "worker.completed" && candidate.actor?.model === requestedModel,
    ),
    sparkReturnedIdle: state.workstations.spark.status === "IDLE",
    parentVerificationVisible: server.store.events.some(
      (candidate) => candidate.type === "verification.started" && candidate.actor?.id === parent.id,
    ),
    runtimeEvidenceMatchesDisplay:
      state.workstations.spark.lastRun?.runtimeModel === requestedModel &&
      state.workstations.spark.lastRun.effort === requestedEffort,
    noFakeWorkerActivity: [...activeWorkerModels].filter(Boolean).every((model) => model === requestedModel),
    verificationPassed: verificationExitCode === 0,
  };

  const report = {
    timestamp: new Date().toISOString(),
    parent: { model: parent.model, effort: parent.effort, sessionId: parent.id },
    worker: {
      requestedModel,
      requestedEffort,
      confirmedModel: confirmedWorkerModel,
      confirmedEffort: confirmedWorkerEffort,
      sessionId: threadId,
      exitCode: workerExitCode,
    },
    verification: { command: "npm test", exitCode: verificationExitCode },
    checks,
    result: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  };
  const outputPath = resolve(stringArg(args, "output") ?? join(projectRoot, "artifacts", "runtime-validation.json"));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Sanitized runtime report: ${outputPath}`);

  const holdMs = Math.max(0, numberArg(args, "hold", 0) * 1_000);
  if (holdMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, holdMs));
  await cleanup();
  emergencyCleanup = undefined;
  if (report.result !== "PASS") process.exitCode = 1;
}

function help(): void {
  console.log(`Codex Router Studio

Usage:
  codex-router-studio start [--rollout <jsonl> | --auto] [--port 4317] [--no-open | --disabled]
  codex-router-studio replay <events.jsonl> [--speed 4] [--headless] [--no-open]
  codex-router-studio emit --type <lifecycle-event> [event options]
  codex-router-studio validate-runtime [--parent-rollout <jsonl>] [--model <id>] [--open]

Worker bays activate only from confirmed rollout/process evidence. The emit command cannot create worker execution.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "help";
  switch (command) {
    case "start":
      await startCommand(args);
      break;
    case "replay":
      await replayCommand(args);
      break;
    case "emit":
      await emitCommand(args);
      break;
    case "validate-runtime":
      await validateRuntimeCommand(args);
      break;
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    default:
      help();
      throw new Error(`Unknown command: ${command}`);
  }
}

void main().catch(async (error: unknown) => {
  try {
    await emergencyCleanup?.();
  } catch {
    // Preserve the original validation error.
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
