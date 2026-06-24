import { clusterRepo } from "./cluster";
import { pool } from "./db";

async function main() {
  const repo = process.argv[2];

  if (!repo) {
    console.error("Usage: npx tsx src/cluster-cli.ts <repo-url>");
    console.error("Example: npx tsx src/cluster-cli.ts https://github.com/expressjs/express");
    process.exit(1);
  }

  const clusters = await clusterRepo(repo);
  console.log(JSON.stringify(clusters, null, 2));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });