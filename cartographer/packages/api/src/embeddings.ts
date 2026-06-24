import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { pool } from "./db";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Types (mirrors Rust CLI output exactly) ───────────────────────────────────

interface GraphNode {
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
}

interface Graph {
  repo: string;
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string; import_type: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Languages worth embedding — skip json/yaml/markdown, they add noise
const EMBEDDABLE = new Set([
  "javascript", "typescript", "python",
  "go", "rust", "ruby", "java", "cpp", "c", "csharp",
]);

const BATCH_SIZE = 20;   // OpenAI allows up to 2048 inputs — 20 is safe and fast
const RATE_DELAY = 200;  // ms between batches — text-embedding-3-small is generous

// ── Text prep ─────────────────────────────────────────────────────────────────

// We embed a compact summary of each file, not the full content.
// First 60 lines captures: imports, exports, class/function declarations.
// That's all the semantic signal we need for clustering.
function buildEmbedInput(node: GraphNode, repoRoot: string): string {
  let snippet = "";
  try {
    const abs = path.join(repoRoot, node.path);
    const content = fs.readFileSync(abs, "utf-8");
    snippet = content.split("\n").slice(0, 60).join("\n").slice(0, 2000);
  } catch {
    // File unreadable — embed metadata only, still useful
  }

  return [
    `File: ${node.path}`,
    `Language: ${node.language}`,
    `in_degree: ${node.in_degree}  out_degree: ${node.out_degree}`,
    `churn: ${node.churn}`,
    "---",
    snippet,
  ].join("\n");
}

// ── OpenAI call ───────────────────────────────────────────────────────────────

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",  // 1536 dims, ~$0.02 per 1M tokens
    input: inputs,
  });
  // API guarantees results are in the same order as inputs
  return res.data.map((d) => d.embedding);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Upsert one file's embedding ───────────────────────────────────────────────

async function upsertEmbedding(
  repo: string,
  node: GraphNode,
  embedding: number[]
): Promise<void> {
  // Store as JSON string — pgvector accepts '[0.1, 0.2, ...]' format
  const vecStr = `[${embedding.join(",")}]`;

  await pool.query(
    `INSERT INTO file_embeddings (repo, path, language, embedding)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (repo, path) DO UPDATE
       SET embedding  = EXCLUDED.embedding,
           language   = EXCLUDED.language,
           created_at = NOW()`,
    [repo, node.path, node.language, vecStr]
  );
}

// ── Main: embed an entire repo ────────────────────────────────────────────────

export async function embedRepo(
  graphPath: string,
  repoRoot: string
): Promise<void> {
  const graph: Graph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  const { repo, nodes } = graph;

  const toEmbed = nodes.filter((n) => EMBEDDABLE.has(n.language));
  const skipped = nodes.length - toEmbed.length;

  console.log(`\nEmbedding ${toEmbed.length} files  (skipping ${skipped} non-source files)`);
  console.log(`Repo: ${repo}\n`);

  let done = 0;

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((n) => buildEmbedInput(n, repoRoot));

    let vectors: number[][];
    try {
      vectors = await embedBatch(inputs);
    } catch (err: any) {
      console.warn(`  Batch failed: ${err.message} — retrying in 5s`);
      await sleep(5000);
      vectors = await embedBatch(inputs);
    }

    for (let j = 0; j < batch.length; j++) {
      await upsertEmbedding(repo, batch[j], vectors[j]);
      done++;
    }

    const pct = Math.round((done / toEmbed.length) * 100);
    process.stdout.write(`\r  [${done}/${toEmbed.length}] ${pct}%`);

    if (i + BATCH_SIZE < toEmbed.length) {
      await sleep(RATE_DELAY);
    }
  }

  console.log(`\n\nDone — ${done} embeddings stored in Postgres.\n`);
}

// ── Similarity search (used in Week 3 AI layer) ───────────────────────────────

export async function findSimilar(
  repo: string,
  filePath: string,
  limit = 5
): Promise<Array<{ path: string; language: string; similarity: number }>> {
  // Fetch the stored vector for the query file
  const q = await pool.query(
    `SELECT embedding FROM file_embeddings WHERE repo = $1 AND path = $2`,
    [repo, filePath]
  );

  if (q.rows.length === 0) return [];

  const vec = q.rows[0].embedding; // pgvector returns it as a string

  // <=> is cosine distance in pgvector — lower = more similar
  // 1 - distance = similarity score
  const res = await pool.query(
    `SELECT path, language, 1 - (embedding <=> $1::vector) AS similarity
     FROM file_embeddings
     WHERE repo = $2
       AND path != $3
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [vec, repo, filePath, limit]
  );

  return res.rows;
}