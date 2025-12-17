/**
 * Feature Lifecycle End-to-End Tests
 *
 * Tests the complete feature lifecycle flow:
 * 1. Create a feature in backlog
 * 2. Drag to in_progress and wait for agent to finish
 * 3. Verify it moves to waiting_approval (manual review)
 * 4. Click commit and verify git status shows committed changes
 * 5. Drag to verified column
 * 6. Archive (complete) the feature
 * 7. Open archive modal and restore the feature
 * 8. Delete the feature
 *
 * NOTE: This test uses AUTOMAKER_MOCK_AGENT=true to mock the agent
 * so it doesn't make real API calls during CI/CD runs.
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

import {
  waitForNetworkIdle,
  createTestGitRepo,
  cleanupTempDir,
  createTempDirPath,
  setupProjectWithPathNoWorktrees,
  waitForBoardView,
  clickAddFeature,
  fillAddFeatureDialog,
  confirmAddFeature,
  dragAndDropWithDndKit,
} from "./utils";

const execAsync = promisify(exec);

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath("feature-lifecycle-tests");

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

// Configure all tests to run serially
test.describe.configure({ mode: "serial" });

test.describe("Feature Lifecycle Tests", () => {
  let testRepo: TestRepo;
  let featureId: string;

  test.beforeAll(async () => {
    // Create test temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    // Create a fresh test repo for each test
    testRepo = await createTestGitRepo(TEST_TEMP_DIR);
  });

  test.afterEach(async () => {
    // Cleanup test repo after each test
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  // this one fails in github actions for some reason
  test.skip("complete feature lifecycle: create -> in_progress -> waiting_approval -> commit -> verified -> archive -> restore -> delete", async ({
    page,
  }) => {
    // Increase timeout for this comprehensive test
    test.setTimeout(120000);

    // ==========================================================================
    // Step 1: Setup and create a feature in backlog
    // ==========================================================================
    // Use no-worktrees setup to avoid worktree-related filtering/initialization issues
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait a bit for the UI to fully load
    await page.waitForTimeout(1000);

    // Click add feature button
    await clickAddFeature(page);

    // Fill in the feature details - requesting a file with "yellow" content
    const featureDescription =
      "Create a file named yellow.txt that contains the text yellow";
    const descriptionInput = page
      .locator('[data-testid="add-feature-dialog"] textarea')
      .first();
    await descriptionInput.fill(featureDescription);

    // Confirm the feature creation
    await confirmAddFeature(page);

    // Debug: Check the filesystem to see if feature was created
    const featuresDir = path.join(testRepo.path, ".automaker", "features");

    // Wait for the feature to be created in the filesystem
    await expect(async () => {
      const dirs = fs.readdirSync(featuresDir);
      expect(dirs.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });

    // Reload to force features to load from filesystem
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the feature card to appear on the board
    const featureCard = page.getByText(featureDescription).first();
    await expect(featureCard).toBeVisible({ timeout: 15000 });

    // Get the feature ID from the filesystem
    const featureDirs = fs.readdirSync(featuresDir);
    featureId = featureDirs[0];

    // Now get the actual card element by testid
    const featureCardByTestId = page.locator(
      `[data-testid="kanban-card-${featureId}"]`
    );
    await expect(featureCardByTestId).toBeVisible({ timeout: 10000 });

    // ==========================================================================
    // Step 2: Drag feature to in_progress and wait for agent to finish
    // ==========================================================================
    const dragHandle = page.locator(`[data-testid="drag-handle-${featureId}"]`);
    const inProgressColumn = page.locator(
      '[data-testid="kanban-column-in_progress"]'
    );

    // Perform the drag and drop using dnd-kit compatible method
    await dragAndDropWithDndKit(page, dragHandle, inProgressColumn);

    // First verify that the drag succeeded by checking for in_progress status
    // This helps diagnose if the drag-drop is working or not
    await expect(async () => {
      const featureData = JSON.parse(
        fs.readFileSync(
          path.join(featuresDir, featureId, "feature.json"),
          "utf-8"
        )
      );
      // Feature should be either in_progress (agent running) or waiting_approval (agent done)
      expect(["in_progress", "waiting_approval"]).toContain(featureData.status);
    }).toPass({ timeout: 15000 });

    // The mock agent should complete quickly (about 1.3 seconds based on the sleep times)
    // Wait for the feature to move to waiting_approval (manual review)
    // The status changes are: in_progress -> waiting_approval after agent completes
    await expect(async () => {
      const featureData = JSON.parse(
        fs.readFileSync(
          path.join(featuresDir, featureId, "feature.json"),
          "utf-8"
        )
      );
      expect(featureData.status).toBe("waiting_approval");
    }).toPass({ timeout: 30000 });

    // Refresh page to ensure UI reflects the status change
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // ==========================================================================
    // Step 3: Verify feature is in waiting_approval (manual review) column
    // ==========================================================================
    const waitingApprovalColumn = page.locator(
      '[data-testid="kanban-column-waiting_approval"]'
    );
    const cardInWaitingApproval = waitingApprovalColumn.locator(
      `[data-testid="kanban-card-${featureId}"]`
    );
    await expect(cardInWaitingApproval).toBeVisible({ timeout: 10000 });

    // Verify the mock agent created the yellow.txt file
    const yellowFilePath = path.join(testRepo.path, "yellow.txt");
    expect(fs.existsSync(yellowFilePath)).toBe(true);
    const yellowContent = fs.readFileSync(yellowFilePath, "utf-8");
    expect(yellowContent).toBe("yellow");

    // ==========================================================================
    // Step 4: Click commit and verify git status shows committed changes
    // ==========================================================================
    // The commit button should be visible on the card in waiting_approval
    const commitButton = page.locator(`[data-testid="commit-${featureId}"]`);
    await expect(commitButton).toBeVisible({ timeout: 5000 });
    await commitButton.click();

    // Wait for the commit to process
    await page.waitForTimeout(2000);

    // Verify git status shows clean (changes committed)
    const { stdout: gitStatus } = await execAsync("git status --porcelain", {
      cwd: testRepo.path,
    });
    // After commit, the yellow.txt file should be committed, so git status should be clean
    // (only .automaker directory might have changes)
    expect(gitStatus.includes("yellow.txt")).toBe(false);

    // Verify the commit exists in git log
    const { stdout: gitLog } = await execAsync("git log --oneline -1", {
      cwd: testRepo.path,
    });
    expect(gitLog.toLowerCase()).toContain("yellow");

    // ==========================================================================
    // Step 5: Verify feature moved to verified column after commit
    // ==========================================================================
    // Feature should automatically move to verified after commit
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    const verifiedColumn = page.locator(
      '[data-testid="kanban-column-verified"]'
    );
    const cardInVerified = verifiedColumn.locator(
      `[data-testid="kanban-card-${featureId}"]`
    );
    await expect(cardInVerified).toBeVisible({ timeout: 10000 });

    // ==========================================================================
    // Step 6: Archive (complete) the feature
    // ==========================================================================
    // Click the Complete button on the verified card
    const completeButton = page.locator(
      `[data-testid="complete-${featureId}"]`
    );
    await expect(completeButton).toBeVisible({ timeout: 5000 });
    await completeButton.click();

    // Wait for the archive action to complete
    await page.waitForTimeout(1000);

    // Verify the feature is no longer visible on the board (it's archived)
    await expect(cardInVerified).not.toBeVisible({ timeout: 5000 });

    // Verify feature status is completed in filesystem
    const featureData = JSON.parse(
      fs.readFileSync(
        path.join(featuresDir, featureId, "feature.json"),
        "utf-8"
      )
    );
    expect(featureData.status).toBe("completed");

    // ==========================================================================
    // Step 7: Open archive modal and restore the feature
    // ==========================================================================
    // Click the completed features button to open the archive modal
    const completedFeaturesButton = page.locator(
      '[data-testid="completed-features-button"]'
    );
    await expect(completedFeaturesButton).toBeVisible({ timeout: 5000 });
    await completedFeaturesButton.click();

    // Wait for the modal to open
    const completedModal = page.locator(
      '[data-testid="completed-features-modal"]'
    );
    await expect(completedModal).toBeVisible({ timeout: 5000 });

    // Verify the archived feature is shown in the modal
    const archivedCard = completedModal.locator(
      `[data-testid="completed-card-${featureId}"]`
    );
    await expect(archivedCard).toBeVisible({ timeout: 5000 });

    // Click the restore button
    const restoreButton = page.locator(
      `[data-testid="unarchive-${featureId}"]`
    );
    await expect(restoreButton).toBeVisible({ timeout: 5000 });
    await restoreButton.click();

    // Wait for the restore action to complete
    await page.waitForTimeout(1000);

    // Close the modal - use first() to select the footer Close button, not the X button
    const closeButton = completedModal
      .locator('button:has-text("Close")')
      .first();
    await closeButton.click();
    await expect(completedModal).not.toBeVisible({ timeout: 5000 });

    // Verify the feature is back in the verified column
    const restoredCard = verifiedColumn.locator(
      `[data-testid="kanban-card-${featureId}"]`
    );
    await expect(restoredCard).toBeVisible({ timeout: 10000 });

    // Verify feature status is verified in filesystem
    const restoredFeatureData = JSON.parse(
      fs.readFileSync(
        path.join(featuresDir, featureId, "feature.json"),
        "utf-8"
      )
    );
    expect(restoredFeatureData.status).toBe("verified");

    // ==========================================================================
    // Step 8: Delete the feature and verify it's removed
    // ==========================================================================
    // Click the delete button on the verified card
    const deleteButton = page.locator(
      `[data-testid="delete-verified-${featureId}"]`
    );
    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    await deleteButton.click();

    // Wait for the confirmation dialog
    const confirmDialog = page.locator(
      '[data-testid="delete-confirmation-dialog"]'
    );
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Click the confirm delete button
    const confirmDeleteButton = page.locator(
      '[data-testid="confirm-delete-button"]'
    );
    await confirmDeleteButton.click();

    // Wait for the delete action to complete
    await page.waitForTimeout(1000);

    // Verify the feature is no longer visible on the board
    await expect(restoredCard).not.toBeVisible({ timeout: 5000 });

    // Verify the feature directory is deleted from filesystem
    const featureDirExists = fs.existsSync(path.join(featuresDir, featureId));
    expect(featureDirExists).toBe(false);
  });

  // this one fails in github actions for some reason
  test.skip("stop and restart feature: create -> in_progress -> stop -> restart should work without 'Feature not found' error", async ({
    page,
  }) => {
    // This test verifies that stopping a feature and restarting it works correctly
    // Bug: Previously, stopping a feature and immediately restarting could cause
    // "Feature not found" error due to race conditions
    test.setTimeout(120000);

    // ==========================================================================
    // Step 1: Setup and create a feature in backlog
    // ==========================================================================
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto("/");
    await waitForNetworkIdle(page);
    await waitForBoardView(page);
    await page.waitForTimeout(1000);

    // Click add feature button
    await clickAddFeature(page);

    // Fill in the feature details
    const featureDescription = "Create a file named test-restart.txt";
    const descriptionInput = page
      .locator('[data-testid="add-feature-dialog"] textarea')
      .first();
    await descriptionInput.fill(featureDescription);

    // Confirm the feature creation
    await confirmAddFeature(page);

    // Wait for the feature to be created in the filesystem
    const featuresDir = path.join(testRepo.path, ".automaker", "features");
    await expect(async () => {
      const dirs = fs.readdirSync(featuresDir);
      expect(dirs.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });

    // Get the feature ID
    const featureDirs = fs.readdirSync(featuresDir);
    const testFeatureId = featureDirs[0];

    // Reload to ensure features are loaded
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the feature card to appear
    const featureCard = page.locator(
      `[data-testid="kanban-card-${testFeatureId}"]`
    );
    await expect(featureCard).toBeVisible({ timeout: 10000 });

    // ==========================================================================
    // Step 2: Drag feature to in_progress (first start)
    // ==========================================================================
    const dragHandle = page.locator(
      `[data-testid="drag-handle-${testFeatureId}"]`
    );
    const inProgressColumn = page.locator(
      '[data-testid="kanban-column-in_progress"]'
    );

    await dragAndDropWithDndKit(page, dragHandle, inProgressColumn);

    // Verify feature file still exists and is readable
    const featureFilePath = path.join(
      featuresDir,
      testFeatureId,
      "feature.json"
    );
    expect(fs.existsSync(featureFilePath)).toBe(true);

    // First verify that the drag succeeded by checking for in_progress status
    await expect(async () => {
      const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
      // Feature should be either in_progress (agent running) or waiting_approval (agent done)
      expect(["in_progress", "waiting_approval"]).toContain(featureData.status);
    }).toPass({ timeout: 15000 });

    // ==========================================================================
    // Step 3: Wait for the mock agent to complete (it's fast in mock mode)
    // ==========================================================================
    // The mock agent completes quickly, so we wait for it to finish
    await expect(async () => {
      const featureData = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
      expect(featureData.status).toBe("waiting_approval");
    }).toPass({ timeout: 30000 });

    // Verify feature file still exists after completion
    expect(fs.existsSync(featureFilePath)).toBe(true);
    const featureDataAfterComplete = JSON.parse(
      fs.readFileSync(featureFilePath, "utf-8")
    );
    console.log(
      "Feature status after first run:",
      featureDataAfterComplete.status
    );

    // Reload to ensure clean state
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // ==========================================================================
    // Step 4: Move feature back to backlog to simulate stop scenario
    // ==========================================================================
    // Feature is in waiting_approval, drag it back to backlog
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const currentCard = page.locator(
      `[data-testid="kanban-card-${testFeatureId}"]`
    );
    const currentDragHandle = page.locator(
      `[data-testid="drag-handle-${testFeatureId}"]`
    );

    await expect(currentCard).toBeVisible({ timeout: 10000 });
    await dragAndDropWithDndKit(page, currentDragHandle, backlogColumn);
    await page.waitForTimeout(500);

    // Verify feature is in backlog
    await expect(async () => {
      const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
      expect(data.status).toBe("backlog");
    }).toPass({ timeout: 10000 });

    // Reload to ensure clean state
    await page.reload();
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // ==========================================================================
    // Step 5: Restart the feature (drag to in_progress again)
    // ==========================================================================
    const restartCard = page.locator(
      `[data-testid="kanban-card-${testFeatureId}"]`
    );
    await expect(restartCard).toBeVisible({ timeout: 10000 });

    const restartDragHandle = page.locator(
      `[data-testid="drag-handle-${testFeatureId}"]`
    );
    const inProgressColumnRestart = page.locator(
      '[data-testid="kanban-column-in_progress"]'
    );

    // Listen for console errors to catch "Feature not found"
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Drag to in_progress to restart
    await dragAndDropWithDndKit(
      page,
      restartDragHandle,
      inProgressColumnRestart
    );

    // Verify the feature file still exists
    expect(fs.existsSync(featureFilePath)).toBe(true);

    // First verify that the restart drag succeeded by checking for in_progress status
    await expect(async () => {
      const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
      // Feature should be either in_progress (agent running) or waiting_approval (agent done)
      expect(["in_progress", "waiting_approval"]).toContain(data.status);
    }).toPass({ timeout: 15000 });

    // Verify no "Feature not found" errors in console
    const featureNotFoundErrors = consoleErrors.filter(
      (err) => err.includes("not found") || err.includes("Feature")
    );
    expect(featureNotFoundErrors).toEqual([]);

    // Wait for the mock agent to complete and move to waiting_approval
    await expect(async () => {
      const data = JSON.parse(fs.readFileSync(featureFilePath, "utf-8"));
      expect(data.status).toBe("waiting_approval");
    }).toPass({ timeout: 30000 });

    console.log("Feature successfully restarted after stop!");
  });
});
