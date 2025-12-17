/**
 * GET /gh-status endpoint - Get GitHub CLI status
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

// Extended PATH to include common tool installation locations
const extendedPath = [
  process.env.PATH,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/home/linuxbrew/.linuxbrew/bin",
  `${process.env.HOME}/.local/bin`,
].filter(Boolean).join(":");

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  path: string | null;
  user: string | null;
  error?: string;
}

async function getGhStatus(): Promise<GhStatus> {
  const status: GhStatus = {
    installed: false,
    authenticated: false,
    version: null,
    path: null,
    user: null,
  };

  const isWindows = process.platform === "win32";

  // Check if gh CLI is installed
  try {
    const findCommand = isWindows ? "where gh" : "command -v gh";
    const { stdout } = await execAsync(findCommand, { env: execEnv });
    status.path = stdout.trim().split(/\r?\n/)[0];
    status.installed = true;
  } catch {
    // gh not in PATH, try common locations
    const commonPaths = isWindows
      ? [
          path.join(process.env.LOCALAPPDATA || "", "Programs", "gh", "bin", "gh.exe"),
          path.join(process.env.ProgramFiles || "", "GitHub CLI", "gh.exe"),
        ]
      : [
          "/opt/homebrew/bin/gh",
          "/usr/local/bin/gh",
          path.join(os.homedir(), ".local", "bin", "gh"),
          "/home/linuxbrew/.linuxbrew/bin/gh",
        ];

    for (const p of commonPaths) {
      try {
        await fs.access(p);
        status.path = p;
        status.installed = true;
        break;
      } catch {
        // Not found at this path
      }
    }
  }

  if (!status.installed) {
    return status;
  }

  // Get version
  try {
    const { stdout } = await execAsync("gh --version", { env: execEnv });
    // Extract version from output like "gh version 2.40.1 (2024-01-09)"
    const versionMatch = stdout.match(/gh version ([\d.]+)/);
    status.version = versionMatch ? versionMatch[1] : stdout.trim().split("\n")[0];
  } catch {
    // Version command failed
  }

  // Check authentication status
  try {
    const { stdout } = await execAsync("gh auth status", { env: execEnv });
    // If this succeeds without error, we're authenticated
    status.authenticated = true;

    // Try to extract username from output
    const userMatch = stdout.match(/Logged in to [^\s]+ account ([^\s]+)/i) ||
                      stdout.match(/Logged in to [^\s]+ as ([^\s]+)/i);
    if (userMatch) {
      status.user = userMatch[1];
    }
  } catch (error: unknown) {
    // Auth status returns non-zero if not authenticated
    const err = error as { stderr?: string };
    if (err.stderr?.includes("not logged in")) {
      status.authenticated = false;
    }
  }

  return status;
}

export function createGhStatusHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await getGhStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, "Get GitHub CLI status failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
