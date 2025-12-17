import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSafe, existsSafe } from "@/lib/fs-utils.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("fs-utils.ts", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `fs-utils-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("mkdirSafe", () => {
    it("should create a new directory", async () => {
      const newDir = path.join(testDir, "new-directory");
      await mkdirSafe(newDir);

      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should succeed if directory already exists", async () => {
      const existingDir = path.join(testDir, "existing");
      await fs.mkdir(existingDir);

      // Should not throw
      await expect(mkdirSafe(existingDir)).resolves.toBeUndefined();
    });

    it("should create nested directories", async () => {
      const nestedDir = path.join(testDir, "a", "b", "c");
      await mkdirSafe(nestedDir);

      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should throw if path exists as a file", async () => {
      const filePath = path.join(testDir, "file.txt");
      await fs.writeFile(filePath, "content");

      await expect(mkdirSafe(filePath)).rejects.toThrow(
        "Path exists and is not a directory"
      );
    });

    it("should succeed if path is a symlink to a directory", async () => {
      const realDir = path.join(testDir, "real-dir");
      const symlinkPath = path.join(testDir, "link-to-dir");
      await fs.mkdir(realDir);
      await fs.symlink(realDir, symlinkPath);

      // Should not throw
      await expect(mkdirSafe(symlinkPath)).resolves.toBeUndefined();
    });
  });

  describe("existsSafe", () => {
    it("should return true for existing file", async () => {
      const filePath = path.join(testDir, "test-file.txt");
      await fs.writeFile(filePath, "content");

      const exists = await existsSafe(filePath);
      expect(exists).toBe(true);
    });

    it("should return true for existing directory", async () => {
      const dirPath = path.join(testDir, "test-dir");
      await fs.mkdir(dirPath);

      const exists = await existsSafe(dirPath);
      expect(exists).toBe(true);
    });

    it("should return false for non-existent path", async () => {
      const nonExistent = path.join(testDir, "does-not-exist");

      const exists = await existsSafe(nonExistent);
      expect(exists).toBe(false);
    });

    it("should return true for symlink", async () => {
      const realFile = path.join(testDir, "real-file.txt");
      const symlinkPath = path.join(testDir, "link-to-file");
      await fs.writeFile(realFile, "content");
      await fs.symlink(realFile, symlinkPath);

      const exists = await existsSafe(symlinkPath);
      expect(exists).toBe(true);
    });

    it("should return true for broken symlink (symlink exists even if target doesn't)", async () => {
      const symlinkPath = path.join(testDir, "broken-link");
      const nonExistent = path.join(testDir, "non-existent-target");
      await fs.symlink(nonExistent, symlinkPath);

      const exists = await existsSafe(symlinkPath);
      expect(exists).toBe(true);
    });
  });
});
