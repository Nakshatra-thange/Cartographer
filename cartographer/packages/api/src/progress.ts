import { Response } from "express";

// Steps that match what we show in the React UI
export type ProgressStep =
  | "cloning"
  | "parsing"
  | "embedding"
  | "clustering"
  | "done"
  | "error";

export interface ProgressEvent {
  step: ProgressStep;
  message: string;
  percent: number;
}

// One SSE stream per repo build, keyed by repo URL
// Multiple browser tabs watching the same repo share the same stream
const streams = new Map<string, Set<Response>>();

export function registerStream(repo: string, res: Response): void {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  if (!streams.has(repo)) streams.set(repo, new Set());
  streams.get(repo)!.add(res);

  // Send a heartbeat immediately so the browser doesn't time out
  res.write("data: {\"step\":\"cloning\",\"message\":\"Starting...\",\"percent\":0}\n\n");

  res.on("close", () => {
    streams.get(repo)?.delete(res);
    if (streams.get(repo)?.size === 0) streams.delete(repo);
  });
}

export function emit(repo: string, event: ProgressEvent): void {
  const subs = streams.get(repo);
  if (!subs || subs.size === 0) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch { /* client disconnected */ }
  }

  if (event.step === "done" || event.step === "error") {
    // Give clients 500ms to receive final event then clean up
    setTimeout(() => {
      for (const res of subs) {
        try { res.end(); } catch { /* already closed */ }
      }
      streams.delete(repo);
    }, 500);
  }
}