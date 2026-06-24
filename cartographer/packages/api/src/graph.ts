import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { embedRepo } from "./embeddings";
import { clusterRepo, ClusterResult } from "./cluster";
import { ensureSchema } from "./db";

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
  cluster_id: number;   // added by Day 6
  cluster_label: string; // placeholder — filled by LLM in Week 3
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

const TMP_DIR    = "/tmp/cartographer";
const CLONE_DIR  = "/tmp/cartographer-repo";
const CLI_PATH   = path.resolve(__dirname, "../../cli/target/debug/cartographer-cli");

function graphPath(repo: string): string {
  // Safe filename from repo URL
  const safe = repo.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(TMP_DIR, `${safe}.json`);
}

// ── Step 1: Run Rust CLI ──────────────────────────────────────────────────────

function runCli(repo: string, outPath: string): void {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  console.log("[1/3] Running Rust CLI...");

  const result = child_process.spawnSync(
    CLI_PATH,
    [repo, "--clone-dir", CLONE_DIR, "--out", outPath],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }
  );

  // CLI writes progress to stderr, graph JSON to the --out file
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(`CLI exited with code ${result.status}: ${result.stderr}`);
  }

  if (!fs.existsSync(outPath)) {
    throw new Error(`CLI did not produce output file at ${outPath}`);
  }
}

// ── Step 2: Embed + cluster ───────────────────────────────────────────────────

async function embedAndCluster(
  repo: string,
  outPath: string
): Promise<ClusterResult[]> {
  console.log("[2/3] Embedding files...");
  await embedRepo(outPath, CLONE_DIR);

  console.log("[3/3] Clustering...");
  return clusterRepo(repo);
}

// ── Step 3: Merge cluster IDs into graph nodes ────────────────────────────────

function mergeGraph(outPath: string, clusters: ClusterResult[]): Graph {
  const raw = JSON.parse(fs.readFileSync(outPath, "utf-8"));

  // Build lookup: path → cluster_id
  const clusterMap = new Map<string, number>(
    clusters.map((c) => [c.path, c.cluster_id])
  );

  const nodes: GraphNode[] = raw.nodes.map((n: any) => ({
    ...n,
    cluster_id:    clusterMap.get(n.path) ?? -1,
    cluster_label: `Cluster ${clusterMap.get(n.path) ?? "?"}`, // Week 3 replaces this
  }));

  return {
    repo:          raw.repo,
    generated_at:  raw.generated_at,
    history_days:  raw.history_days,
    node_count:    nodes.length,
    edge_count:    raw.edges.length,
    nodes,
    edges:         raw.edges,
  };
}

// ── Public: build or return cached graph ──────────────────────────────────────

// Simple in-memory cache keyed by repo URL.
// Day 13 replaces this with Redis keyed by repo + latest commit SHA.
const cache = new Map<string, { graph: Graph; builtAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export async function getGraph(repo: string): Promise<Graph> {
  const cached = cache.get(repo);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    console.log(`[cache] Returning cached graph for ${repo}`);
    return cached.graph;
  }

  await ensureSchema();

  const out = graphPath(repo);

  runCli(repo, out);
  const clusters = await embedAndCluster(repo, out);
  const graph = mergeGraph(out, clusters);

  cache.set(repo, { graph, builtAt: Date.now() });
  return graph;
}