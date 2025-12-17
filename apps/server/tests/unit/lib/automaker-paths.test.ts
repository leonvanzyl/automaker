import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs/promises";
import os from "os";
import {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAutomakerDir,
} from "@/lib/automaker-paths.js";

describe("automaker-paths.ts", () => {
  const projectPath = "/test/project";

  describe("getAutomakerDir", () => {
    it("should return path to .automaker directory", () => {
      expect(getAutomakerDir(projectPath)).toBe("/test/project/.automaker");
    });

    it("should handle paths with trailing slashes", () => {
      expect(getAutomakerDir("/test/project/")).toBe(
        path.join("/test/project/", ".automaker")
      );
    });
  });

  describe("getFeaturesDir", () => {
    it("should return path to features directory", () => {
      expect(getFeaturesDir(projectPath)).toBe(
        "/test/project/.automaker/features"
      );
    });
  });

  describe("getFeatureDir", () => {
    it("should return path to specific feature directory", () => {
      expect(getFeatureDir(projectPath, "feature-123")).toBe(
        "/test/project/.automaker/features/feature-123"
      );
    });

    it("should handle feature IDs with special characters", () => {
      expect(getFeatureDir(projectPath, "my-feature_v2")).toBe(
        "/test/project/.automaker/features/my-feature_v2"
      );
    });
  });

  describe("getFeatureImagesDir", () => {
    it("should return path to feature images directory", () => {
      expect(getFeatureImagesDir(projectPath, "feature-123")).toBe(
        "/test/project/.automaker/features/feature-123/images"
      );
    });
  });

  describe("getBoardDir", () => {
    it("should return path to board directory", () => {
      expect(getBoardDir(projectPath)).toBe("/test/project/.automaker/board");
    });
  });

  describe("getImagesDir", () => {
    it("should return path to images directory", () => {
      expect(getImagesDir(projectPath)).toBe("/test/project/.automaker/images");
    });
  });

  describe("getWorktreesDir", () => {
    it("should return path to worktrees directory", () => {
      expect(getWorktreesDir(projectPath)).toBe(
        "/test/project/.automaker/worktrees"
      );
    });
  });

  describe("getAppSpecPath", () => {
    it("should return path to app_spec.txt file", () => {
      expect(getAppSpecPath(projectPath)).toBe(
        "/test/project/.automaker/app_spec.txt"
      );
    });
  });

  describe("getBranchTrackingPath", () => {
    it("should return path to active-branches.json file", () => {
      expect(getBranchTrackingPath(projectPath)).toBe(
        "/test/project/.automaker/active-branches.json"
      );
    });
  });

  describe("ensureAutomakerDir", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `automaker-paths-test-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should create automaker directory and return path", async () => {
      const result = await ensureAutomakerDir(testDir);

      expect(result).toBe(path.join(testDir, ".automaker"));
      const stats = await fs.stat(result);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should succeed if directory already exists", async () => {
      const automakerDir = path.join(testDir, ".automaker");
      await fs.mkdir(automakerDir, { recursive: true });

      const result = await ensureAutomakerDir(testDir);

      expect(result).toBe(automakerDir);
    });
  });
});
