import { logger } from "../services/logger";

const runningJobs = new Set<string>();

export async function runJobOnce<T>(jobName: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (runningJobs.has(jobName)) {
    logger.warn("Job skipped because already running", { jobName });
    return undefined;
  }
  const startedAt = Date.now();
  runningJobs.add(jobName);
  logger.info("Job started", { jobName });
  try {
    const result = await fn();
    logger.info("Job finished", { jobName, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logger.error("Job failed", { jobName, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    return undefined;
  } finally {
    runningJobs.delete(jobName);
  }
}
