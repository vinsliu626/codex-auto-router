import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";
import { parseStudioEvent } from "../runtime/replay.js";
import type { StudioEvent } from "../shared/types.js";
import { StudioStore } from "./studio-store.js";

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export interface StudioServerOptions {
  host?: string;
  port?: number;
  webRoot: string;
  mode?: "live" | "replay";
  store?: StudioStore;
}

export interface StudioServer {
  store: StudioStore;
  token: string;
  url: string;
  publish: (event: StudioEvent) => boolean;
  close: () => Promise<void>;
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'");
  response.setHeader("Cache-Control", "no-store");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const rawChunk of request) {
    const chunk: unknown = rawChunk;
    if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) {
      throw new Error("INVALID_BODY_CHUNK");
    }
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 65_536) throw new Error("BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function startStudioServer(options: StudioServerOptions): Promise<StudioServer> {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    throw new Error("Router Studio binds to localhost only");
  }

  const webRoot = resolve(options.webRoot);
  const store = options.store ?? new StudioStore(options.mode ?? "live");
  const token = randomBytes(24).toString("base64url");
  const streams = new Set<ServerResponse>();

  const server = createServer(async (request, response) => {
    securityHeaders(response);
    const requestUrl = new URL(request.url ?? "/", `http://${host}`);

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      json(response, 200, { ok: true, mode: store.state.mode, eventCount: store.state.eventCount });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/state") {
      json(response, 200, store.state);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/events") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Connection", "keep-alive");
      response.write(`event: state\ndata: ${JSON.stringify(store.state)}\n\n`);
      streams.add(response);
      request.on("close", () => streams.delete(response));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/events") {
      if (request.headers["x-studio-token"] !== token) {
        json(response, 403, { error: "Invalid Studio connection token" });
        return;
      }
      try {
        const event = parseStudioEvent(await readJsonBody(request));
        if (!event) {
          json(response, 422, { error: "Invalid Studio event" });
          return;
        }
        if (["worker.spawned", "worker.status", "worker.completed", "worker.blocked"].includes(event.type)) {
          json(response, 422, { error: "Worker execution events must come from a runtime adapter" });
          return;
        }
        store.publish(event);
        json(response, 202, { accepted: true });
      } catch (error) {
        json(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, {
          error: "Invalid request body",
        });
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      json(response, 405, { error: "Method not allowed" });
      return;
    }

    const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
    const target = resolve(webRoot, relativePath);
    if (target !== webRoot && !target.startsWith(`${webRoot}${sep}`)) {
      json(response, 404, { error: "Not found" });
      return;
    }
    try {
      const targetStat = await stat(target);
      if (!targetStat.isFile()) throw new Error("NOT_FILE");
      response.statusCode = 200;
      response.setHeader("Content-Type", MIME[extname(target)] ?? "application/octet-stream");
      if (request.method === "HEAD") response.end();
      else createReadStream(target).pipe(response);
    } catch {
      json(response, 404, { error: "Not found" });
    }
  });

  const unsubscribe = store.subscribe((event, state) => {
    const payload = event
      ? `event: update\ndata: ${JSON.stringify({ event, state })}\n\n`
      : `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    for (const stream of streams) stream.write(payload);
  });
  const ticker = setInterval(() => store.tick(), 250);

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4317, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    store,
    token,
    url: `http://${host}:${address.port}`,
    publish: (event) => store.publish(event),
    close: async () => {
      clearInterval(ticker);
      unsubscribe();
      for (const stream of streams) stream.end();
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}
