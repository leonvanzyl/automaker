/**
 * POST /diffs endpoint - Get diffs for a worktree
 */

import type { Request, Response } from "express";
import path from "path";
import fs from "fs/promises";
import { getErrorMessage, logError } from "../common.js";
import { getGitRepositoryDiffs } from "../../common.js";

export function createDiffsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res
          .status(400)
          .json({
            success: false,
            error: "projectPath and featureId required",
          });
        return;
      }

      // Git worktrees are stored in project directory
      const worktreePath = path.join(projectPath, ".worktrees", featureId);

      try {
        // Check if worktree exists
        await fs.access(worktreePath);

        // Get diffs from worktree
        const result = await getGitRepositoryDiffs(worktreePath);
        res.json({
          success: true,
          diff: result.diff,
          files: result.files,
          hasChanges: result.hasChanges,
        });
      } catch (innerError) {
        // Worktree doesn't exist - fallback to main project path
        logError(innerError, "Worktree access failed, falling back to main project");

        try {
          const result = await getGitRepositoryDiffs(projectPath);
          res.json({
            success: true,
            diff: result.diff,
            files: result.files,
            hasChanges: result.hasChanges,
          });
        } catch (fallbackError) {
          logError(fallbackError, "Fallback to main project also failed");
          res.json({ success: true, diff: "", files: [], hasChanges: false });
        }
      }
    } catch (error) {
      logError(error, "Get worktree diffs failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
