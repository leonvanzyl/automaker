/**
 * Auto Mode Service - Autonomous feature implementation using Claude Agent SDK
 *
 * Manages:
 * - Worktree creation for isolated development
 * - Feature execution with Claude
 * - Concurrent execution with max concurrency limits
 * - Progress streaming via events
 * - Verification and merge workflows
 */

import { query, AbortError, type Options } from "@anthropic-ai/claude-agent-sdk";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import type { EventEmitter, EventType } from "../lib/events.js";

const execAsync = promisify(exec);

interface Feature {
  id: string;
  title: string;
  description: string;
  status: string;
  priority?: number;
  spec?: string;
}

interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
}

interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
}

export class AutoModeService {
  private events: EventEmitter;
  private runningFeatures = new Map<string, RunningFeature>();
  private autoLoopRunning = false;
  private autoLoopAbortController: AbortController | null = null;
  private config: AutoModeConfig | null = null;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Start the auto mode loop - continuously picks and executes pending features
   */
  async startAutoLoop(projectPath: string, maxConcurrency = 3): Promise<void> {
    if (this.autoLoopRunning) {
      throw new Error("Auto mode is already running");
    }

    this.autoLoopRunning = true;
    this.autoLoopAbortController = new AbortController();
    this.config = {
      maxConcurrency,
      useWorktrees: true,
      projectPath,
    };

    this.emitAutoModeEvent("auto_mode_complete", {
      message: `Auto mode started with max ${maxConcurrency} concurrent features`,
      projectPath,
    });

    // Run the loop in the background
    this.runAutoLoop().catch((error) => {
      console.error("[AutoMode] Loop error:", error);
      this.emitAutoModeEvent("auto_mode_error", {
        error: error.message,
      });
    });
  }

  private async runAutoLoop(): Promise<void> {
    while (this.autoLoopRunning && this.autoLoopAbortController && !this.autoLoopAbortController.signal.aborted) {
      try {
        // Check if we have capacity
        if (this.runningFeatures.size >= (this.config?.maxConcurrency || 3)) {
          await this.sleep(5000);
          continue;
        }

        // Load pending features
        const pendingFeatures = await this.loadPendingFeatures(this.config!.projectPath);

        if (pendingFeatures.length === 0) {
          this.emitAutoModeEvent("auto_mode_complete", {
            message: "No pending features - auto mode idle",
          });
          await this.sleep(10000);
          continue;
        }

        // Find a feature not currently running
        const nextFeature = pendingFeatures.find((f) => !this.runningFeatures.has(f.id));

        if (nextFeature) {
          // Start feature execution in background
          this.executeFeature(
            this.config!.projectPath,
            nextFeature.id,
            this.config!.useWorktrees,
            true
          ).catch((error) => {
            console.error(`[AutoMode] Feature ${nextFeature.id} error:`, error);
          });
        }

        await this.sleep(2000);
      } catch (error) {
        console.error("[AutoMode] Loop iteration error:", error);
        await this.sleep(5000);
      }
    }

    this.autoLoopRunning = false;
    this.emitAutoModeEvent("auto_mode_complete", {
      message: "Auto mode stopped",
    });
  }

  /**
   * Stop the auto mode loop
   */
  async stopAutoLoop(): Promise<number> {
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    return this.runningFeatures.size;
  }

  /**
   * Execute a single feature
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = true,
    isAutoMode = false
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();
    const branchName = `feature/${featureId}`;
    let worktreePath: string | null = null;

    // Setup worktree if enabled
    if (useWorktrees) {
      worktreePath = await this.setupWorktree(projectPath, featureId, branchName);
    }

    const workDir = worktreePath || projectPath;

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode,
      startTime: Date.now(),
    });

    // Emit feature start event
    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId,
      projectPath,
      feature: { id: featureId, title: "Loading...", description: "Feature is starting" },
    });

    try {
      // Load feature details
      const feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, "in_progress");

      // Build the prompt
      const prompt = this.buildFeaturePrompt(feature);

      // Run the agent
      await this.runAgent(workDir, featureId, prompt, abortController);

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(projectPath, featureId, "waiting_approval");

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Feature completed in ${Math.round((Date.now() - this.runningFeatures.get(featureId)!.startTime) / 1000)}s`,
        projectPath,
      });
    } catch (error) {
      if (error instanceof AbortError || (error as Error)?.name === "AbortError") {
        this.emitAutoModeEvent("auto_mode_feature_complete", {
          featureId,
          passes: false,
          message: "Feature stopped by user",
          projectPath,
        });
      } else {
        const errorMessage = (error as Error).message || "Unknown error";
        const isAuthError = errorMessage.includes("Authentication failed") ||
                           errorMessage.includes("Invalid API key") ||
                           errorMessage.includes("authentication_failed");

        console.error(`[AutoMode] Feature ${featureId} failed:`, error);
        await this.updateFeatureStatus(projectPath, featureId, "backlog");
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: errorMessage,
          errorType: isAuthError ? "authentication" : "execution",
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Stop a specific feature
   */
  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    running.abortController.abort();
    return true;
  }

  /**
   * Resume a feature (continues from saved context)
   */
  async resumeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = true
  ): Promise<void> {
    // Check if context exists
    const contextPath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );

    let hasContext = false;
    try {
      await fs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    if (hasContext) {
      // Load previous context and continue
      const context = await fs.readFile(contextPath, "utf-8");
      return this.executeFeatureWithContext(projectPath, featureId, context, useWorktrees);
    }

    // No context, start fresh
    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Follow up on a feature with additional instructions
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();

    // Check if worktree exists
    const worktreePath = path.join(projectPath, ".automaker", "worktrees", featureId);
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree, use project path
    }

    // Load feature info for context
    const feature = await this.loadFeature(projectPath, featureId);

    // Load previous agent output if it exists
    const contextPath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );
    let previousContext = "";
    try {
      previousContext = await fs.readFile(contextPath, "utf-8");
    } catch {
      // No previous context
    }

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? this.buildFeaturePrompt(feature) : `**Feature ID:** ${featureId}`}
`;

    if (previousContext) {
      fullPrompt += `
## Previous Agent Work
The following is the output from the previous implementation attempt:

${previousContext}
`;
    }

    fullPrompt += `
## Follow-up Instructions
${prompt}

## Task
Address the follow-up instructions above. Review the previous work and make the requested changes or fixes.`;

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath: workDir !== projectPath ? worktreePath : null,
      branchName: `feature/${featureId}`,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
    });

    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId,
      projectPath,
      feature: feature || { id: featureId, title: "Follow-up", description: prompt.substring(0, 100) },
    });

    try {
      await this.runAgent(workDir, featureId, fullPrompt, abortController, imagePaths);

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(projectPath, featureId, "waiting_approval");

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: "Follow-up completed successfully",
        projectPath,
      });
    } catch (error) {
      if (!(error instanceof AbortError)) {
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: (error as Error).message,
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a feature's implementation
   */
  async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {
    const worktreePath = path.join(projectPath, ".automaker", "worktrees", featureId);
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    // Run verification - check if tests pass, build works, etc.
    const verificationChecks = [
      { cmd: "npm run lint", name: "Lint" },
      { cmd: "npm run typecheck", name: "Type check" },
      { cmd: "npm test", name: "Tests" },
      { cmd: "npm run build", name: "Build" },
    ];

    let allPassed = true;
    const results: Array<{ check: string; passed: boolean; output?: string }> = [];

    for (const check of verificationChecks) {
      try {
        const { stdout, stderr } = await execAsync(check.cmd, {
          cwd: workDir,
          timeout: 120000,
        });
        results.push({ check: check.name, passed: true, output: stdout || stderr });
      } catch (error) {
        allPassed = false;
        results.push({
          check: check.name,
          passed: false,
          output: (error as Error).message,
        });
        break; // Stop on first failure
      }
    }

    this.emitAutoModeEvent("auto_mode_feature_complete", {
      featureId,
      passes: allPassed,
      message: allPassed
        ? "All verification checks passed"
        : `Verification failed: ${results.find(r => !r.passed)?.check || "Unknown"}`,
    });

    return allPassed;
  }

  /**
   * Commit feature changes
   */
  async commitFeature(projectPath: string, featureId: string): Promise<string | null> {
    const worktreePath = path.join(projectPath, ".automaker", "worktrees", featureId);
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    try {
      // Check for changes
      const { stdout: status } = await execAsync("git status --porcelain", { cwd: workDir });
      if (!status.trim()) {
        return null; // No changes
      }

      // Load feature for commit message
      const feature = await this.loadFeature(projectPath, featureId);
      const commitMessage = feature
        ? `feat: ${feature.title}\n\nImplemented by Automaker auto-mode`
        : `feat: Feature ${featureId}`;

      // Stage and commit
      await execAsync("git add -A", { cwd: workDir });
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: workDir,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync("git rev-parse HEAD", { cwd: workDir });

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Changes committed: ${hash.trim().substring(0, 8)}`,
      });

      return hash.trim();
    } catch (error) {
      console.error(`[AutoMode] Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Check if context exists for a feature
   */
  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    const contextPath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );

    try {
      await fs.access(contextPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze project to gather context
   */
  async analyzeProject(projectPath: string): Promise<void> {
    const abortController = new AbortController();

    const analysisFeatureId = `analysis-${Date.now()}`;
    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId: analysisFeatureId,
      projectPath,
      feature: { id: analysisFeatureId, title: "Project Analysis", description: "Analyzing project structure" },
    });

    const prompt = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

    try {
      const options: Options = {
        model: "claude-sonnet-4-20250514",
        maxTurns: 5,
        cwd: projectPath,
        allowedTools: ["Read", "Glob", "Grep"],
        permissionMode: "acceptEdits",
        abortController,
      };

      const stream = query({ prompt, options });
      let analysisResult = "";

      for await (const msg of stream) {
        if (msg.type === "assistant" && msg.message.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              analysisResult = block.text;
              this.emitAutoModeEvent("auto_mode_progress", {
                featureId: analysisFeatureId,
                content: block.text,
                projectPath,
              });
            }
          }
        } else if (msg.type === "result" && msg.subtype === "success") {
          analysisResult = msg.result || analysisResult;
        }
      }

      // Save analysis
      const analysisPath = path.join(projectPath, ".automaker", "project-analysis.md");
      await fs.mkdir(path.dirname(analysisPath), { recursive: true });
      await fs.writeFile(analysisPath, analysisResult);

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId: analysisFeatureId,
        passes: true,
        message: "Project analysis completed",
        projectPath,
      });
    } catch (error) {
      this.emitAutoModeEvent("auto_mode_error", {
        featureId: analysisFeatureId,
        error: (error as Error).message,
        projectPath,
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    autoLoopRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
  } {
    return {
      isRunning: this.autoLoopRunning || this.runningFeatures.size > 0,
      autoLoopRunning: this.autoLoopRunning,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  // Private helpers

  private async setupWorktree(
    projectPath: string,
    featureId: string,
    branchName: string
  ): Promise<string> {
    const worktreesDir = path.join(projectPath, ".automaker", "worktrees");
    const worktreePath = path.join(worktreesDir, featureId);

    await fs.mkdir(worktreesDir, { recursive: true });

    // Check if worktree already exists
    try {
      await fs.access(worktreePath);
      return worktreePath;
    } catch {
      // Create new worktree
    }

    // Create branch if it doesn't exist
    try {
      await execAsync(`git branch ${branchName}`, { cwd: projectPath });
    } catch {
      // Branch may already exist
    }

    // Create worktree
    try {
      await execAsync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: projectPath,
      });
    } catch (error) {
      // Worktree creation failed, fall back to direct execution
      console.error(`[AutoMode] Worktree creation failed:`, error);
      return projectPath;
    }

    return worktreePath;
  }

  private async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    const featurePath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "feature.json"
    );

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async updateFeatureStatus(
    projectPath: string,
    featureId: string,
    status: string
  ): Promise<void> {
    const featurePath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "feature.json"
    );

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      const feature = JSON.parse(data);
      feature.status = status;
      feature.updatedAt = new Date().toISOString();
      await fs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch {
      // Feature file may not exist
    }
  }

  private async loadPendingFeatures(projectPath: string): Promise<Feature[]> {
    const featuresDir = path.join(projectPath, ".automaker", "features");

    try {
      const entries = await fs.readdir(featuresDir, { withFileTypes: true });
      const features: Feature[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, "feature.json");
          try {
            const data = await fs.readFile(featurePath, "utf-8");
            const feature = JSON.parse(data);
            if (feature.status === "pending" || feature.status === "ready") {
              features.push(feature);
            }
          } catch {
            // Skip invalid features
          }
        }
      }

      // Sort by priority
      return features.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    } catch {
      return [];
    }
  }

  private buildFeaturePrompt(feature: Feature): string {
    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${feature.title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    prompt += `
## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Add or update tests as needed
5. Ensure the code follows existing patterns and conventions

When done, summarize what you implemented and any notes for the developer.`;

    return prompt;
  }

  private async runAgent(
    workDir: string,
    featureId: string,
    prompt: string,
    abortController: AbortController,
    imagePaths?: string[]
  ): Promise<void> {
    const options: Options = {
      model: "claude-opus-4-5-20251101",
      maxTurns: 50,
      cwd: workDir,
      allowedTools: [
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "Bash",
      ],
      permissionMode: "acceptEdits",
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
      abortController,
    };

    // Build prompt - include image paths for the agent to read
    let finalPrompt = prompt;

    if (imagePaths && imagePaths.length > 0) {
      finalPrompt = `${prompt}\n\n## Reference Images\nThe following images are available for reference. Use the Read tool to view them:\n${imagePaths.map((p) => `- ${p}`).join("\n")}`;
    }

    const stream = query({ prompt: finalPrompt, options });
    let responseText = "";
    const outputPath = path.join(workDir, ".automaker", "features", featureId, "agent-output.md");

    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText = block.text;

            // Check for authentication errors in the response
            if (block.text.includes("Invalid API key") ||
                block.text.includes("authentication_failed") ||
                block.text.includes("Fix external API key")) {
              throw new Error(
                "Authentication failed: Invalid or expired API key. " +
                "Please check your ANTHROPIC_API_KEY or run 'claude login' to re-authenticate."
              );
            }

            this.emitAutoModeEvent("auto_mode_progress", {
              featureId,
              content: block.text,
            });
          } else if (block.type === "tool_use") {
            this.emitAutoModeEvent("auto_mode_tool", {
              featureId,
              tool: block.name,
              input: block.input,
            });
          }
        }
      } else if (msg.type === "assistant" && (msg as { error?: string }).error === "authentication_failed") {
        // Handle authentication error from the SDK
        throw new Error(
          "Authentication failed: Invalid or expired API key. " +
          "Please set a valid ANTHROPIC_API_KEY environment variable or run 'claude login' to authenticate."
        );
      } else if (msg.type === "result" && msg.subtype === "success") {
        // Check if result indicates an error
        if (msg.is_error && msg.result?.includes("Invalid API key")) {
          throw new Error(
            "Authentication failed: Invalid or expired API key. " +
            "Please set a valid ANTHROPIC_API_KEY environment variable or run 'claude login' to authenticate."
          );
        }
        responseText = msg.result || responseText;
      }
    }

    // Save agent output
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, responseText);
    } catch {
      // May fail if directory doesn't exist
    }
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const prompt = `## Continuing Feature Implementation

${this.buildFeaturePrompt(feature)}

## Previous Context
The following is the output from a previous implementation attempt. Continue from where you left off:

${context}

## Instructions
Review the previous work and continue the implementation. If the feature appears complete, verify it works correctly.`;

    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   */
  private emitAutoModeEvent(
    eventType: string,
    data: Record<string, unknown>
  ): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit("auto-mode:event", {
      type: eventType,
      ...data,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
