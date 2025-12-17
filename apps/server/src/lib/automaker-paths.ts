/**
 * Automaker Paths - Utilities for managing automaker data storage
 *
 * Stores project data inside the project directory at {projectPath}/.automaker/
 */

import fs from "fs/promises";
import path from "path";

/**
 * Get the automaker data directory for a project
 * This is stored inside the project at .automaker/
 */
export function getAutomakerDir(projectPath: string): string {
  return path.join(projectPath, ".automaker");
}

/**
 * Get the features directory for a project
 */
export function getFeaturesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "features");
}

/**
 * Get the directory for a specific feature
 */
export function getFeatureDir(projectPath: string, featureId: string): string {
  return path.join(getFeaturesDir(projectPath), featureId);
}

/**
 * Get the images directory for a feature
 */
export function getFeatureImagesDir(
  projectPath: string,
  featureId: string
): string {
  return path.join(getFeatureDir(projectPath, featureId), "images");
}

/**
 * Get the board directory for a project (board backgrounds, etc.)
 */
export function getBoardDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "board");
}

/**
 * Get the images directory for a project (general images)
 */
export function getImagesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "images");
}

/**
 * Get the worktrees metadata directory for a project
 */
export function getWorktreesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "worktrees");
}

/**
 * Get the app spec file path for a project
 */
export function getAppSpecPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "app_spec.txt");
}

/**
 * Get the branch tracking file path for a project
 */
export function getBranchTrackingPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "active-branches.json");
}

/**
 * Ensure the automaker directory structure exists for a project
 */
export async function ensureAutomakerDir(projectPath: string): Promise<string> {
  const automakerDir = getAutomakerDir(projectPath);
  await fs.mkdir(automakerDir, { recursive: true });
  return automakerDir;
}
