import { pool } from "./db";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileVec {
  path: string;
  language: string;
  embedding: number[];
}

export interface ClusterResult {
  path: string;
  language: string;
  cluster_id: number;
}

// ── Math ──────────────────────────────────────────────────────────────────────

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(ma) * Math.sqrt(mb) + 1e-10);
}

function centroid(vecs: number[][]): number[] {
  const dim = vecs[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  return out.map((x) => x / vecs.length);
}

// ── k-means (cosine distance) ─────────────────────────────────────────────────

function kmeans(files: FileVec[], k: number, maxIter = 50): number[] {
  const n = files.length;

  // Edge case: fewer files than clusters
  if (n <= k) return files.map((_, i) => i);

  // Deterministic init: spread starting centroids evenly across sorted file list
  let centroids = Array.from({ length: k }, (_, i) =>
    [...files[Math.floor((i * n) / k)].embedding]
  );

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // ── Assignment step ───────────────────────────────────────────────────
    let changed = false;

    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestDist = Infinity;

      for (let c = 0; c < k; c++) {
        const d = cosineDistance(files[i].embedding, centroids[c]);
        if (d < bestDist) { bestDist = d; bestCluster = c; }
      }

      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) {
      console.log(`  Converged at iteration ${iter + 1}`);
      break;
    }

    // ── Update step: recompute centroids ──────────────────────────────────
    for (let c = 0; c < k; c++) {
      const members = files
        .filter((_, i) => assignments[i] === c)
        .map((f) => f.embedding);

      if (members.length > 0) {
        centroids[c] = centroid(members);
      }
    }
  }

  return assignments;
}

// ── Parse pgvector string → number[] ─────────────────────────────────────────
// pgvector returns embeddings as the string "[0.1,0.2,...]"
// We need to parse that back into a float array

function parseVec(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    return JSON.parse(raw.replace(/^\[/, "[").replace(/\]$/, "]"));
  }
  return [];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function clusterRepo(repo: string): Promise<ClusterResult[]> {
  const res = await pool.query(
    `SELECT path, language, embedding
     FROM file_embeddings
     WHERE repo = $1
     ORDER BY path`,
    [repo]
  );

  if (res.rows.length === 0) {
    console.error(`No embeddings found for: ${repo}`);
    console.error(`Run embed-cli first.`);
    return [];
  }

  const files: FileVec[] = res.rows.map((row) => ({
    path:      row.path,
    language:  row.language,
    embedding: parseVec(row.embedding),
  }));

  // k heuristic: sqrt(n/2), minimum 2
  const k = Math.max(2, Math.round(Math.sqrt(files.length / 2)));
  console.log(`\nClustering ${files.length} files → k=${k} clusters\n`);

  const assignments = kmeans(files, k);

  // ── Print membership to terminal for sanity check ─────────────────────────
  const byCluster: Record<number, string[]> = {};
  for (let i = 0; i < files.length; i++) {
    const cid = assignments[i];
    (byCluster[cid] ??= []).push(files[i].path);
  }

  for (const [cid, members] of Object.entries(byCluster).sort()) {
    console.log(`Cluster ${cid}  (${members.length} files)`);
    members.slice(0, 5).forEach((p) => console.log(`  ${p}`));
    if (members.length > 5) console.log(`  ... +${members.length - 5} more`);
    console.log();
  }

  return files.map((f, i) => ({
    path:       f.path,
    language:   f.language,
    cluster_id: assignments[i],
  }));
}