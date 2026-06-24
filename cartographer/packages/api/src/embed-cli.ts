import { embedRepo } from "./embeddings";
import { ensureSchema, pool } from "./db";

async function main() {
  const graphPath = process.argv[2];
  const repoRoot  = process.argv[3];

  if (!graphPath || !repoRoot) {
    console.error("Usage: npx tsx src/embed-cli.ts <graph.json> <repo-root>");
    console.error("");
    console.error("Example:");
    console.error("  npx tsx src/embed-cli.ts ../cli/express-graph.json /tmp/cartographer-repo");
    process.exit(1);
  }

  await ensureSchema();
  await embedRepo(graphPath, repoRoot);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });