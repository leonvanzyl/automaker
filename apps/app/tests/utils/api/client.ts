/**
 * API client utilities for making API calls in tests
 * Provides type-safe wrappers around common API operations
 */

import { Page, APIResponse } from "@playwright/test";
import { API_ENDPOINTS } from "../core/constants";

// ============================================================================
// Types
// ============================================================================

export interface WorktreeInfo {
  path: string;
  branch: string;
  isNew?: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

export interface WorktreeListResponse {
  success: boolean;
  worktrees: WorktreeInfo[];
  error?: string;
}

export interface WorktreeCreateResponse {
  success: boolean;
  worktree?: WorktreeInfo;
  error?: string;
}

export interface WorktreeDeleteResponse {
  success: boolean;
  error?: string;
}

export interface CommitResult {
  committed: boolean;
  branch?: string;
  commitHash?: string;
  message?: string;
}

export interface CommitResponse {
  success: boolean;
  result?: CommitResult;
  error?: string;
}

export interface SwitchBranchResult {
  previousBranch: string;
  currentBranch: string;
  message: string;
}

export interface SwitchBranchResponse {
  success: boolean;
  result?: SwitchBranchResult;
  error?: string;
  code?: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
}

export interface ListBranchesResult {
  currentBranch: string;
  branches: BranchInfo[];
}

export interface ListBranchesResponse {
  success: boolean;
  result?: ListBranchesResult;
  error?: string;
}

// ============================================================================
// Worktree API Client
// ============================================================================

export class WorktreeApiClient {
  constructor(private page: Page) {}

  /**
   * Create a new worktree
   */
  async create(
    projectPath: string,
    branchName: string,
    baseBranch?: string
  ): Promise<{ response: APIResponse; data: WorktreeCreateResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.create, {
      data: {
        projectPath,
        branchName,
        baseBranch,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * Delete a worktree
   */
  async delete(
    projectPath: string,
    worktreePath: string,
    deleteBranch: boolean = true
  ): Promise<{ response: APIResponse; data: WorktreeDeleteResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.delete, {
      data: {
        projectPath,
        worktreePath,
        deleteBranch,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * List all worktrees
   */
  async list(
    projectPath: string,
    includeDetails: boolean = true
  ): Promise<{ response: APIResponse; data: WorktreeListResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.list, {
      data: {
        projectPath,
        includeDetails,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * Commit changes in a worktree
   */
  async commit(
    worktreePath: string,
    message: string
  ): Promise<{ response: APIResponse; data: CommitResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.commit, {
      data: {
        worktreePath,
        message,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * Switch branches in a worktree
   */
  async switchBranch(
    worktreePath: string,
    branchName: string
  ): Promise<{ response: APIResponse; data: SwitchBranchResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.switchBranch, {
      data: {
        worktreePath,
        branchName,
      },
    });
    const data = await response.json();
    return { response, data };
  }

  /**
   * List all branches
   */
  async listBranches(
    worktreePath: string
  ): Promise<{ response: APIResponse; data: ListBranchesResponse }> {
    const response = await this.page.request.post(API_ENDPOINTS.worktree.listBranches, {
      data: {
        worktreePath,
      },
    });
    const data = await response.json();
    return { response, data };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a WorktreeApiClient instance
 */
export function createWorktreeApiClient(page: Page): WorktreeApiClient {
  return new WorktreeApiClient(page);
}

// ============================================================================
// Convenience Functions (for direct use without creating a client)
// ============================================================================

/**
 * Create a worktree via API
 */
export async function apiCreateWorktree(
  page: Page,
  projectPath: string,
  branchName: string,
  baseBranch?: string
): Promise<{ response: APIResponse; data: WorktreeCreateResponse }> {
  return new WorktreeApiClient(page).create(projectPath, branchName, baseBranch);
}

/**
 * Delete a worktree via API
 */
export async function apiDeleteWorktree(
  page: Page,
  projectPath: string,
  worktreePath: string,
  deleteBranch: boolean = true
): Promise<{ response: APIResponse; data: WorktreeDeleteResponse }> {
  return new WorktreeApiClient(page).delete(projectPath, worktreePath, deleteBranch);
}

/**
 * List worktrees via API
 */
export async function apiListWorktrees(
  page: Page,
  projectPath: string,
  includeDetails: boolean = true
): Promise<{ response: APIResponse; data: WorktreeListResponse }> {
  return new WorktreeApiClient(page).list(projectPath, includeDetails);
}

/**
 * Commit changes in a worktree via API
 */
export async function apiCommitWorktree(
  page: Page,
  worktreePath: string,
  message: string
): Promise<{ response: APIResponse; data: CommitResponse }> {
  return new WorktreeApiClient(page).commit(worktreePath, message);
}

/**
 * Switch branches in a worktree via API
 */
export async function apiSwitchBranch(
  page: Page,
  worktreePath: string,
  branchName: string
): Promise<{ response: APIResponse; data: SwitchBranchResponse }> {
  return new WorktreeApiClient(page).switchBranch(worktreePath, branchName);
}

/**
 * List branches via API
 */
export async function apiListBranches(
  page: Page,
  worktreePath: string
): Promise<{ response: APIResponse; data: ListBranchesResponse }> {
  return new WorktreeApiClient(page).listBranches(worktreePath);
}
