/**
 * POST /open-in-editor endpoint - Open a worktree directory in the default code editor
 * GET /default-editor endpoint - Get the name of the default code editor
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

// Editor detection with caching
interface EditorInfo {
  name: string;
  command: string;
}

let cachedEditor: EditorInfo | null = null;

/**
 * Detect which code editor is available on the system
 */
async function detectDefaultEditor(): Promise<EditorInfo> {
  // Return cached result if available
  if (cachedEditor) {
    return cachedEditor;
  }

  // Try Cursor first (if user has Cursor, they probably prefer it)
  try {
    await execAsync("which cursor || where cursor");
    cachedEditor = { name: "Cursor", command: "cursor" };
    return cachedEditor;
  } catch {
    // Cursor not found
  }

  // Try VS Code
  try {
    await execAsync("which code || where code");
    cachedEditor = { name: "VS Code", command: "code" };
    return cachedEditor;
  } catch {
    // VS Code not found
  }

  // Try Zed
  try {
    await execAsync("which zed || where zed");
    cachedEditor = { name: "Zed", command: "zed" };
    return cachedEditor;
  } catch {
    // Zed not found
  }

  // Try Sublime Text
  try {
    await execAsync("which subl || where subl");
    cachedEditor = { name: "Sublime Text", command: "subl" };
    return cachedEditor;
  } catch {
    // Sublime not found
  }

  // Fallback to file manager
  const platform = process.platform;
  if (platform === "darwin") {
    cachedEditor = { name: "Finder", command: "open" };
  } else if (platform === "win32") {
    cachedEditor = { name: "Explorer", command: "explorer" };
  } else {
    cachedEditor = { name: "File Manager", command: "xdg-open" };
  }
  return cachedEditor;
}

export function createGetDefaultEditorHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editor = await detectDefaultEditor();
      res.json({
        success: true,
        result: {
          editorName: editor.name,
          editorCommand: editor.command,
        },
      });
    } catch (error) {
      logError(error, "Get default editor failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createOpenInEditorHandler() {
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

      const editor = await detectDefaultEditor();

      try {
        await execAsync(`${editor.command} "${worktreePath}"`);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in ${editor.name}`,
            editorName: editor.name,
          },
        });
      } catch (editorError) {
        // If the detected editor fails, try opening in default file manager as fallback
        const platform = process.platform;
        let openCommand: string;
        let fallbackName: string;

        if (platform === "darwin") {
          openCommand = `open "${worktreePath}"`;
          fallbackName = "Finder";
        } else if (platform === "win32") {
          openCommand = `explorer "${worktreePath}"`;
          fallbackName = "Explorer";
        } else {
          openCommand = `xdg-open "${worktreePath}"`;
          fallbackName = "File Manager";
        }

        await execAsync(openCommand);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in ${fallbackName}`,
            editorName: fallbackName,
          },
        });
      }
    } catch (error) {
      logError(error, "Open in editor failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
