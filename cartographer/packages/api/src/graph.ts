import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { embedRepo } from "./embeddings";
import { clusterRepo, ClusterResult } from "./cluster";
import { ensureSchema } from "./db";
import { getCachedGraph, setCachedGraph, getCacheKey } from "./cache";
import { emit } from "./progress";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  path: string;
  language: string;
  size_bytes: number;
  churn: number;
  authors: number;
  in_degree: number;
  out_degree: number;
  coupling: number;
  risk_score: number;
  commit_days: number[];
  cluster_id: number;
  cluster_label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  import_type: string;
}

export interface Graph {
  repo: string;
  generated_at: number;
  history_days: number;
  node_count: number;
  edge_count: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const TMP_DIR   = "/tmp/cartographer";
const CLONE_DIR = "/tmp/cartographer-repo";
const CLI_PATH  = path.resolve(__dirname, "../../cli/target/debug/cartographer-cli");

function graphPath(repo: string): string {
  const safe = repo.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(TMP_DIR, `${safe}.json`);
}

// ── Step 1: Rust CLI ──────────────────────────────────────────────────────────

function runCli(repo: string, outPath: string): void {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const result = child_process.spawnSync(
    CLI_PATH,
    [repo, "--clone-dir", CLONE_DIR, "--out", outPath],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }
  );

  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`CLI failed (code ${result.status})`);
  if (!fs.existsSync(outPath)) throw new Error("CLI produced no output file");
}

// ── Step 2: Merge clusters into graph ────────────────────────────────────────

function mergeGraph(outPath: string, clusters: ClusterResult[]): Graph {
  const raw = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  const clusterMap = new Map(clusters.map((c) => [c.path, c.cluster_id]));

  const nodes: GraphNode[] = raw.nodes.map((n: any) => ({
    ...n,
    cluster_id:    clusterMap.get(n.path) ?? -1,
    cluster_label: `Cluster ${clusterMap.get(n.path) ?? "?"}`,
  }));

  return {
    repo:         raw.repo,
    generated_at: raw.generated_at,
    history_days: raw.history_days,
    node_count:   nodes.length,
    edge_count:   raw.edges.length,
    nodes,
    edges:        raw.edges,
  };
}

// ── In-flight deduplication ───────────────────────────────────────────────────
// If two requests come in for the same repo while it's building,
// don't run the pipeline twice — return the same promise.

const inFlight = new Map<string, Promise<Graph>>();

// ── Public: build or return cached graph ──────────────────────────────────────

export async function getGraph(repo: string): Promise<Graph> {
  // 1. Check Redis cache first
  const cacheKey = await getCacheKey(repo);
  const cached   = await getCachedGraph(cacheKey);

  if (cached) {
    console.log(`[cache] HIT for ${repo}`);
    emit(repo, { step: "done", message: "Loaded from cache", percent: 100 });
    return JSON.parse(cached);
  }

  // 2. If already building, return same promise
  if (inFlight.has(repo)) {
    console.log(`[build] Already in flight for ${repo}`);
    return inFlight.get(repo)!;
  }

  // 3. Build
  const promise = buildGraph(repo, cacheKey);
  inFlight.set(repo, promise);

  promise.finally(() => inFlight.delete(repo));

  return promise;
}

async function buildGraph(repo: string, cacheKey: string): Promise<Graph> {
  await ensureSchema();
  const out = graphPath(repo);

  // ── Clone + parse ──────────────────────────────────────────────────────────
  emit(repo, { step: "cloning", message: "Cloning repository...", percent: 5 });
  runCli(repo, out);
  emit(repo, { step: "parsing", message: "Parsing call graph + git history...", percent: 30 });

  // Small delay so the client sees the parsing step
  await new Promise((r) => setTimeout(r, 300));

  // ── Embed ──────────────────────────────────────────────────────────────────
  emit(repo, { step: "embedding", message: "Embedding source files...", percent: 50 });
  await embedRepo(out, CLONE_DIR);

  // ── Cluster ───────────────────────────────────────────────────────────────
  emit(repo, { step: "clustering", message: "Clustering by semantics...", percent: 80 });
  const clusters = await clusterRepo(repo);

  // ── Merge ─────────────────────────────────────────────────────────────────
  const graph = mergeGraph(out, clusters);

  // ── Cache ─────────────────────────────────────────────────────────────────
  await setCachedGraph(cacheKey, JSON.stringify(graph));
  emit(repo, { step: "done", message: "Map ready.", percent: 100 });

  return graph;
}