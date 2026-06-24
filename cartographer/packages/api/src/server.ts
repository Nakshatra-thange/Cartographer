import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { getGraph } from "./graph";
dotenv.config();

const app  = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});


app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now() });
});



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
    console.error("Failed to build graph:", err.message);
    res.status(500).json({ error: err.message });
  }
});



app.listen(PORT, () => {
  console.log(`\nCartographer API running on http://localhost:${PORT}`);
  console.log(`Try: curl "http://localhost:${PORT}/api/graph?repo=https://github.com/expressjs/express"\n`);
});