import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  port:     Number(process.env.PGPORT ?? 5439),
  user:     process.env.PGUSER     ?? "cartographer",
  password: process.env.PGPASSWORD ?? "cartographer",
  database: process.env.PGDATABASE ?? "cartographer",
});

// Run once on startup — idempotent, safe to call every time
export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // pgvector/pgvector image has the extension available — just activate it
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS file_embeddings (
        id          SERIAL PRIMARY KEY,
        repo        TEXT        NOT NULL,
        path        TEXT        NOT NULL,
        language    TEXT        NOT NULL,
        embedding   vector(1536),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (repo, path)
      )
    `);

    // ivfflat index for fast cosine similarity search
    // lists=10 is fine for repos up to ~10k files
    await client.query(`
      CREATE INDEX IF NOT EXISTS file_embeddings_vec_idx
      ON file_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 10)
    `);

    console.log("[db] Schema ready.");
  } finally {
    client.release();
  }
}