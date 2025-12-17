/**
 * POST /list-branches endpoint - List all local branches
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { getErrorMessage, logWorktreeError } from "../common.js";

const execAsync = promisify(exec);

interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export function createListBranchesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: "worktreePath required",
        });
        return;
      }

      // Get current branch
      const { stdout: currentBranchOutput } = await execAsync(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: worktreePath }
      );
      const currentBranch = currentBranchOutput.trim();

      // List all local branches
      const { stdout: branchesOutput } = await execAsync(
        "git branch --format='%(refname:short)'",
        { cwd: worktreePath }
      );

      const branches: BranchInfo[] = branchesOutput
        .trim()
        .split("\n")
        .filter((b) => b.trim())
        .map((name) => ({
          name: name.trim(),
          isCurrent: name.trim() === currentBranch,
          isRemote: false,
        }));

      // Get ahead/behind count for current branch
      let aheadCount = 0;
      let behindCount = 0;
      try {
        // First check if there's a remote tracking branch
        const { stdout: upstreamOutput } = await execAsync(
          `git rev-parse --abbrev-ref ${currentBranch}@{upstream}`,
          { cwd: worktreePath }
        );

        if (upstreamOutput.trim()) {
          const { stdout: aheadBehindOutput } = await execAsync(
            `git rev-list --left-right --count ${currentBranch}@{upstream}...HEAD`,
            { cwd: worktreePath }
          );
          const [behind, ahead] = aheadBehindOutput.trim().split(/\s+/).map(Number);
          aheadCount = ahead || 0;
          behindCount = behind || 0;
        }
      } catch {
        // No upstream branch set, that's okay
      }

      res.json({
        success: true,
        result: {
          currentBranch,
          branches,
          aheadCount,
          behindCount,
        },
      });
    } catch (error) {
      const worktreePath = req.body?.worktreePath;
      logWorktreeError(error, "List branches failed", worktreePath);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
