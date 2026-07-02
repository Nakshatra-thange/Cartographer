import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { getGraph } from "./graph";
import { explainNode } from "./explain";
import { registerStream } from "./progress";
import { getCachedLabels } from "./label-cluster";
dotenv.config();

const app  = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ── SSE progress stream ───────────────────────────────────────────────────────
//
// GET /api/progress?repo=...
//
// Client subscribes here BEFORE calling /api/graph.
// Events: { step, message, percent }

app.get("/api/progress", (req: Request, res: Response) => {
  const repo = req.query.repo as string;
  if (!repo) { res.status(400).end(); return; }
  registerStream(repo, res);
});

// ── Graph endpoint ────────────────────────────────────────────────────────────
//
// GET /api/graph?repo=...
//
// Triggers the build pipeline. Progress events flow over /api/progress.
// Returns the full graph JSON when done.

app.get("/api/graph", async (req: Request, res: Response) => {
  const repo = req.query.repo as string;
  if (!repo || !repo.startsWith("http")) {
    res.status(400).json({ error: "Missing or invalid ?repo= parameter" });
    return;
  }

  console.log(`\nGET /api/graph  repo=${repo}`);

  try {
    const graph = await getGraph(repo);
    res.json(graph);
  } catch (err: any) {
    console.error("Build failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/labels", async (req: Request, res: Response) => {
  const repo = req.query.repo as string;
  if (!repo) { res.status(400).json({ error: "Missing ?repo=" }); return; }

  try {
    const labels = await getCachedLabels(repo);
    res.json(labels ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/explain", async (req: Request, res: Response) => {
  const ctx = req.body;

  if (!ctx?.path || !ctx?.language) {
    res.status(400).json({ error: "Missing required fields: path, language" });
    return;
  }

  try {
    const explanation = await explainNode(ctx);
    res.json(explanation);
  } catch (err: any) {
    console.error("Explain failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nCartographer API → http://localhost:${PORT}\n`);
});