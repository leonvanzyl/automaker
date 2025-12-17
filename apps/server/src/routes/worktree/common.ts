/**
 * Common utilities for worktree routes
 */

import { createLogger } from "../../lib/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

const logger = createLogger("Worktree");
const execAsync = promisify(exec);

/**
 * Normalize path separators to forward slashes for cross-platform consistency.
 * This ensures paths from `path.join()` (backslashes on Windows) match paths
 * from git commands (which may use forward slashes).
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Check if a path is a git repo
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an error is ENOENT (file/path not found or spawn failed)
 * These are expected in test environments with mock paths
 */
export function isENOENT(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/**
 * Check if a path is a mock/test path that doesn't exist
 */
export function isMockPath(worktreePath: string): boolean {
  return worktreePath.startsWith("/mock/") || worktreePath.includes("/mock/");
}

/**
 * Conditionally log worktree errors - suppress ENOENT for mock paths
 * to reduce noise in test output
 */
export function logWorktreeError(
  error: unknown,
  message: string,
  worktreePath?: string
): void {
  // Don't log ENOENT errors for mock paths (expected in tests)
  if (isENOENT(error) && worktreePath && isMockPath(worktreePath)) {
    return;
  }
  logError(error, message);
}

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
