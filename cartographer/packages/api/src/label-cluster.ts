import Anthropic from "@anthropic-ai/sdk";
import { pool } from "./db";
import * as fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const client = new Anthropic();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClusterLabel {
  cluster_id: number;
  label:      string;
  summary:    string;   // 1-sentence description of the cluster's purpose
}

// ── Postgres table for persisted labels ──────────────────────────────────────

export async function ensureClusterLabelTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cluster_labels (
      id          SERIAL PRIMARY KEY,
      repo        TEXT NOT NULL,
      cluster_id  INTEGER NOT NULL,
      label       TEXT NOT NULL,
      summary     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (repo, cluster_id)
    )
  `);
}

export async function getCachedLabels(repo: string): Promise<ClusterLabel[] | null> {
  const res = await pool.query(
    `SELECT cluster_id, label, summary FROM cluster_labels WHERE repo = $1`,
    [repo]
  );
  if (res.rows.length === 0) return null;
  return res.rows;
}

async function saveLabelsToDB(repo: string, labels: ClusterLabel[]): Promise<void> {
  for (const l of labels) {
    await pool.query(
      `INSERT INTO cluster_labels (repo, cluster_id, label, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (repo, cluster_id) DO UPDATE
         SET label = EXCLUDED.label, summary = EXCLUDED.summary, created_at = NOW()`,
      [repo, l.cluster_id, l.label, l.summary]
    );
  }
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

interface ClusterInput {
  cluster_id: number;
  files:      Array<{ path: string; coupling: number; churn: number }>;
}

function buildLabelPrompt(clusters: ClusterInput[]): string {
  const clusterDescriptions = clusters.map((c) => {
    const topFiles = c.files
      .sort((a, b) => b.coupling - a.coupling)
      .slice(0, 6)
      .map((f) => `  - ${f.path} (coupling=${f.coupling}, churn=${f.churn})`)
      .join("\n");

    return `CLUSTER ${c.cluster_id} (${c.files.length} files):\n${topFiles}`;
  }).join("\n\n");

  return `You are a senior software engineer reading a codebase structure.
Below are clusters of files grouped by semantic similarity.
For each cluster, generate:
1. A short label (2-4 words, like "Request Pipeline", "Auth & Sessions", "Database Access Layer", "Test Utilities")
2. A one-sentence summary of what this cluster is responsible for

Rules:
- Labels must be specific to what the files actually do — not generic ("Utilities", "Helpers", "Core")
- If a cluster is mostly test files, label it "Test Suite" or similar
- If a cluster is example/demo files, label it "Examples & Demos"
- Base your answer on the file paths — they contain the truth

${clusterDescriptions}

Respond in this exact JSON format. No markdown, no extra text:
{
  "clusters": [
    { "cluster_id": 0, "label": "2-4 word label", "summary": "One sentence." },
    { "cluster_id": 1, "label": "2-4 word label", "summary": "One sentence." }
  ]
}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function labelClusters(
  repo: string,
  graphPath: string
): Promise<ClusterLabel[]> {
  await ensureClusterLabelTable();

  // Return cached labels if available
  const cached = await getCachedLabels(repo);
  if (cached && cached.length > 0) {
    console.log(`[labels] Using cached labels for ${repo}`);
    return cached;
  }

  // Build cluster inputs from the graph JSON
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));

  const clusterMap = new Map<number, ClusterInput>();

  for (const node of graph.nodes) {
    const cid = node.cluster_id ?? -1;
    if (cid === -1) continue;

    if (!clusterMap.has(cid)) {
      clusterMap.set(cid, { cluster_id: cid, files: [] });
    }
    clusterMap.get(cid)!.files.push({
      path:     node.path,
      coupling: node.coupling,
      churn:    node.churn,
    });
  }

  const clusters = Array.from(clusterMap.values());
  console.log(`[labels] Labelling ${clusters.length} clusters for ${repo}`);

  const prompt  = buildLabelPrompt(clusters);
  const message = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 600,
    messages:   [{ role: "user", content: prompt }],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("");

  let labels: ClusterLabel[];

  try {
    const parsed = JSON.parse(raw.trim());
    labels = parsed.clusters.map((c: any) => ({
      cluster_id: c.cluster_id,
      label:      c.label   ?? `Cluster ${c.cluster_id}`,
      summary:    c.summary ?? "",
    }));
  } catch {
    // Fallback: generate generic labels if parse fails
    console.warn("[labels] Parse failed, using fallback labels");
    labels = clusters.map((c) => ({
      cluster_id: c.cluster_id,
      label:      `Cluster ${c.cluster_id}`,
      summary:    `${c.files.length} files grouped by semantic similarity.`,
    }));
  }

  // Persist to Postgres so we don't re-label on every request
  await saveLabelsToDB(repo, labels);
  console.log(`[labels] Saved ${labels.length} labels to DB`);

  return labels;
}