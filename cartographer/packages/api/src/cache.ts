import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

export const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
});

redis.on("error", (e) => {
  // Redis being down should never crash the API — just log
  console.warn("[redis] connection error:", e.message);
});

const GRAPH_TTL = 60 * 60 * 2; // 2 hours in seconds

export async function getCachedGraph(key: string): Promise<string | null> {
  try {
    return await redis.get(`graph:${key}`);
  } catch {
    return null;
  }
}

export async function setCachedGraph(key: string, json: string): Promise<void> {
  try {
    await redis.set(`graph:${key}`, json, "EX", GRAPH_TTL);
  } catch {
    // Cache write failure is non-fatal
  }
}

export async function getCacheKey(repo: string): Promise<string> {
  // Key = repo URL + latest commit SHA from the cloned repo
  // This means the cache auto-invalidates when the repo gets new commits
  const { execSync } = await import("child_process");
  try {
    const sha = execSync(
      `git -C /tmp/cartographer-repo rev-parse HEAD`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim().slice(0, 12);
    return `${repo}:${sha}`;
  } catch {
    // Repo not cloned yet or git error — use repo URL alone
    return repo;
  }
}