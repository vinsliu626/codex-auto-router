import { StringDecoder } from "node:string_decoder";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CodexRolloutAdapter, type CodexAdapterOptions } from "./codex-adapter.js";
import type { StudioEvent } from "../shared/types.js";

export interface RolloutTailerOptions extends CodexAdapterOptions {
  intervalMs?: number;
  onEvent: (event: StudioEvent) => void;
  onWarning?: (warning: string) => void;
}

export class RolloutTailer {
  readonly adapter: CodexRolloutAdapter;

  private sourcePath: string;
  private intervalMs: number;
  private onEvent: (event: StudioEvent) => void;
  private onWarning?: (warning: string) => void;
  private offset = 0;
  private lineNumber = 0;
  private remainder = "";
  private decoder = new StringDecoder("utf8");
  private timer?: NodeJS.Timeout;
  private polling = false;
  private stopped = true;

  constructor(options: RolloutTailerOptions) {
    this.sourcePath = resolve(options.sourcePath);
    this.intervalMs = options.intervalMs ?? 200;
    this.onEvent = options.onEvent;
    this.onWarning = options.onWarning;
    this.adapter = new CodexRolloutAdapter(options);
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const fileStat = await stat(this.sourcePath);
      if (fileStat.size < this.offset) {
        this.offset = 0;
        this.lineNumber = 0;
        this.remainder = "";
        this.decoder = new StringDecoder("utf8");
      }
      if (fileStat.size === this.offset) return;

      const byteCount = fileStat.size - this.offset;
      const buffer = Buffer.allocUnsafe(byteCount);
      const handle = await open(this.sourcePath, "r");
      try {
        const { bytesRead } = await handle.read(buffer, 0, byteCount, this.offset);
        this.offset += bytesRead;
        this.consume(this.decoder.write(buffer.subarray(0, bytesRead)));
      } finally {
        await handle.close();
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN";
      if (code !== "ENOENT") this.onWarning?.(`Unable to read rollout: ${code}`);
    } finally {
      this.polling = false;
    }
  }

  private consume(chunk: string): void {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    for (const line of lines) {
      this.lineNumber += 1;
      if (!line.trim()) continue;
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        this.onWarning?.(`Malformed rollout JSON ignored at line ${this.lineNumber}`);
        continue;
      }
      for (const event of this.adapter.ingest(row, this.lineNumber)) this.onEvent(event);
    }
  }
}

async function inspectSubagentParent(path: string): Promise<string | undefined> {
  const buffer = await readFile(path);
  const prefix = buffer.subarray(0, Math.min(buffer.length, 262_144)).toString("utf8");
  for (const line of prefix.split(/\r?\n/)) {
    if (!line.includes("session_meta")) continue;
    try {
      const row = JSON.parse(line) as {
        type?: string;
        payload?: {
          thread_source?: string;
          source?: { subagent?: { thread_spawn?: { parent_thread_id?: string } } };
        };
      };
      if (row.type !== "session_meta" || row.payload?.thread_source !== "subagent") continue;
      return row.payload.source?.subagent?.thread_spawn?.parent_thread_id;
    } catch {
      continue;
    }
  }
  return undefined;
}

export interface CodexRunWatcherOptions {
  parentRollout: string;
  onEvent: (event: StudioEvent) => void;
  onWarning?: (warning: string) => void;
  taskSummary?: string;
  intervalMs?: number;
}

export class CodexRunWatcher {
  private options: CodexRunWatcherOptions;
  private parentTailer: RolloutTailer;
  private childTailers = new Map<string, RolloutTailer>();
  private childTimer?: NodeJS.Timeout;
  private parentSessionId: string;

  constructor(options: CodexRunWatcherOptions) {
    this.options = options;
    this.parentSessionId = rolloutId(options.parentRollout);
    this.parentTailer = new RolloutTailer({
      sourcePath: options.parentRollout,
      actorMode: "parent",
      taskSummary: options.taskSummary,
      intervalMs: options.intervalMs,
      onEvent: options.onEvent,
      onWarning: options.onWarning,
    });
  }

  async start(): Promise<void> {
    await this.parentTailer.start();
    this.parentSessionId = this.parentTailer.adapter.sessionId;
    await this.discoverChildren();
    this.childTimer = setInterval(() => void this.discoverChildren(), 750);
  }

  stop(): void {
    this.parentTailer.stop();
    if (this.childTimer) clearInterval(this.childTimer);
    for (const tailer of this.childTailers.values()) tailer.stop();
    this.childTailers.clear();
  }

  private async discoverChildren(): Promise<void> {
    const directory = dirname(this.options.parentRollout);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const path = join(directory, entry.name);
      if (resolve(path) === resolve(this.options.parentRollout) || this.childTailers.has(path)) continue;
      let parentId: string | undefined;
      try {
        parentId = await inspectSubagentParent(path);
      } catch {
        continue;
      }
      if (parentId !== this.parentSessionId) continue;

      const tailer = new RolloutTailer({
        sourcePath: path,
        actorMode: "auto",
        parentSessionId: parentId,
        intervalMs: this.options.intervalMs,
        onEvent: this.options.onEvent,
        onWarning: this.options.onWarning,
      });
      this.childTailers.set(path, tailer);
      await tailer.start();
    }
  }
}

export function rolloutId(path: string): string {
  return path.match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i)?.[1] ?? path;
}

export async function findLatestRollout(sessionRoot: string): Promise<string | undefined> {
  const files = await listJsonl(sessionRoot);
  const withStats = await Promise.all(
    files.map(async (path) => ({ path, modified: (await stat(path)).mtimeMs })),
  );
  return withStats.sort((a, b) => b.modified - a.modified)[0]?.path;
}

export async function findRolloutByThreadId(
  sessionRoot: string,
  threadId: string,
): Promise<string | undefined> {
  return (await listJsonl(sessionRoot)).find((path) => path.includes(threadId));
}

async function listJsonl(directory: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await listJsonl(path)));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) results.push(path);
  }
  return results;
}
