import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CircleDot,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Circle,
  X,
  Wand2,
  GitPullRequest,
  User,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  getElectronAPI,
  GitHubIssue,
  IssueValidationResult,
  IssueComplexity,
  IssueValidationEvent,
  StoredValidation,
} from '@/lib/electron';

/**
 * Map issue complexity to feature priority.
 * Lower complexity issues get higher priority (1 = high, 2 = medium).
 */
function getFeaturePriority(complexity: IssueComplexity | undefined): number {
  switch (complexity) {
    case 'trivial':
    case 'simple':
      return 1; // High priority for easy wins
    case 'moderate':
    case 'complex':
    case 'very_complex':
    default:
      return 2; // Medium priority for larger efforts
  }
}
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ValidationDialog } from './github-issues-view/validation-dialog';

export function GitHubIssuesView() {
  const [openIssues, setOpenIssues] = useState<GitHubIssue[]>([]);
  const [closedIssues, setClosedIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [validatingIssues, setValidatingIssues] = useState<Set<number>>(new Set());
  const [validationResult, setValidationResult] = useState<IssueValidationResult | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  // Track cached validations for display
  const [cachedValidations, setCachedValidations] = useState<Map<number, StoredValidation>>(
    new Map()
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { currentProject, validationModel, muteDoneSound } = useAppStore();

  const fetchIssues = useCallback(async () => {
    if (!currentProject?.path) {
      setError('No project selected');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.listIssues(currentProject.path);
        if (result.success) {
          setOpenIssues(result.openIssues || []);
          setClosedIssues(result.closedIssues || []);
        } else {
          setError(result.error || 'Failed to fetch issues');
        }
      }
    } catch (err) {
      console.error('[GitHubIssuesView] Error fetching issues:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentProject?.path]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  // Load cached validations on mount
  useEffect(() => {
    const loadCachedValidations = async () => {
      if (!currentProject?.path) return;

      try {
        const api = getElectronAPI();
        if (api.github?.getValidations) {
          const result = await api.github.getValidations(currentProject.path);
          if (result.success && result.validations) {
            const map = new Map<number, StoredValidation>();
            for (const v of result.validations) {
              map.set(v.issueNumber, v);
            }
            setCachedValidations(map);
          }
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Failed to load cached validations:', err);
      }
    };

    loadCachedValidations();
  }, [currentProject?.path]);

  // Load running validations on mount (restore validatingIssues state)
  useEffect(() => {
    const loadRunningValidations = async () => {
      if (!currentProject?.path) return;

      try {
        const api = getElectronAPI();
        if (api.github?.getValidationStatus) {
          const result = await api.github.getValidationStatus(currentProject.path);
          if (result.success && result.runningIssues) {
            setValidatingIssues(new Set(result.runningIssues));
          }
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Failed to load running validations:', err);
      }
    };

    loadRunningValidations();
  }, [currentProject?.path]);

  // Subscribe to validation events
  useEffect(() => {
    const api = getElectronAPI();
    if (!api.github?.onValidationEvent) return;

    const handleValidationEvent = (event: IssueValidationEvent) => {
      // Only handle events for current project
      if (event.projectPath !== currentProject?.path) return;

      switch (event.type) {
        case 'issue_validation_start':
          setValidatingIssues((prev) => new Set([...prev, event.issueNumber]));
          break;

        case 'issue_validation_complete':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.issueNumber);
            return next;
          });

          // Update cached validations (use event.model to avoid stale closure race condition)
          setCachedValidations((prev) => {
            const next = new Map(prev);
            next.set(event.issueNumber, {
              issueNumber: event.issueNumber,
              issueTitle: event.issueTitle,
              validatedAt: new Date().toISOString(),
              model: event.model,
              result: event.result,
            });
            return next;
          });

          // Show toast notification
          toast.success(`Issue #${event.issueNumber} validated: ${event.result.verdict}`, {
            description:
              event.result.verdict === 'valid'
                ? 'Issue is ready to be converted to a task'
                : event.result.verdict === 'invalid'
                  ? 'Issue may have problems'
                  : 'Issue needs clarification',
          });

          // Play audio notification (if not muted)
          if (!muteDoneSound) {
            try {
              if (!audioRef.current) {
                audioRef.current = new Audio('/sounds/ding.mp3');
              }
              audioRef.current.play().catch(() => {
                // Audio play might fail due to browser restrictions
              });
            } catch {
              // Ignore audio errors
            }
          }

          // If validation dialog is open for this issue, update the result
          if (selectedIssue?.number === event.issueNumber && showValidationDialog) {
            setValidationResult(event.result);
          }
          break;

        case 'issue_validation_error':
          setValidatingIssues((prev) => {
            const next = new Set(prev);
            next.delete(event.issueNumber);
            return next;
          });
          toast.error(`Validation failed for issue #${event.issueNumber}`, {
            description: event.error,
          });
          if (selectedIssue?.number === event.issueNumber && showValidationDialog) {
            setShowValidationDialog(false);
          }
          break;
      }
    };

    const unsubscribe = api.github.onValidationEvent(handleValidationEvent);
    return () => unsubscribe();
  }, [currentProject?.path, selectedIssue, showValidationDialog, validationModel, muteDoneSound]);

  // Cleanup audio element on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchIssues();
  }, [fetchIssues]);

  const handleOpenInGitHub = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  const handleValidateIssue = useCallback(
    async (issue: GitHubIssue, showDialog = true) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      // Check if already validating this issue
      if (validatingIssues.has(issue.number)) {
        toast.info(`Validation already in progress for issue #${issue.number}`);
        return;
      }

      // Check for cached result - if fresh, show it directly
      const cached = cachedValidations.get(issue.number);
      if (cached && showDialog) {
        // Check if validation is stale (older than 24 hours)
        const validatedAt = new Date(cached.validatedAt);
        const hoursSinceValidation = (Date.now() - validatedAt.getTime()) / (1000 * 60 * 60);
        const isStale = hoursSinceValidation > 24;

        if (!isStale) {
          // Show cached result directly
          setValidationResult(cached.result);
          setShowValidationDialog(true);
          return;
        }
      }

      // Start async validation
      setValidationResult(null);
      if (showDialog) {
        setShowValidationDialog(true);
      }

      try {
        const api = getElectronAPI();
        if (api.github?.validateIssue) {
          const result = await api.github.validateIssue(
            currentProject.path,
            {
              issueNumber: issue.number,
              issueTitle: issue.title,
              issueBody: issue.body || '',
              issueLabels: issue.labels.map((l) => l.name),
            },
            validationModel
          );

          if (!result.success) {
            toast.error(result.error || 'Failed to start validation');
            if (showDialog) {
              setShowValidationDialog(false);
            }
          }
          // On success, the result will come through the event stream
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Validation error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to validate issue');
        if (showDialog) {
          setShowValidationDialog(false);
        }
      }
    },
    [currentProject?.path, validatingIssues, cachedValidations, validationModel]
  );

  // View cached validation result
  const handleViewCachedValidation = useCallback(
    async (issue: GitHubIssue) => {
      const cached = cachedValidations.get(issue.number);
      if (cached) {
        setValidationResult(cached.result);
        setShowValidationDialog(true);

        // Mark as viewed if not already viewed
        if (!cached.viewedAt && currentProject?.path) {
          try {
            const api = getElectronAPI();
            if (api.github?.markValidationViewed) {
              await api.github.markValidationViewed(currentProject.path, issue.number);
              // Update local state
              setCachedValidations((prev) => {
                const next = new Map(prev);
                const updated = prev.get(issue.number);
                if (updated) {
                  next.set(issue.number, {
                    ...updated,
                    viewedAt: new Date().toISOString(),
                  });
                }
                return next;
              });
            }
          } catch (err) {
            console.error('[GitHubIssuesView] Failed to mark validation as viewed:', err);
          }
        }
      }
    },
    [cachedValidations, currentProject?.path]
  );

  const handleConvertToTask = useCallback(
    async (issue: GitHubIssue, validation: IssueValidationResult) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (api.features?.create) {
          // Build description from issue body + validation info
          const description = [
            `**From GitHub Issue #${issue.number}**`,
            '',
            issue.body || 'No description provided.',
            '',
            '---',
            '',
            '**AI Validation Analysis:**',
            validation.reasoning,
            validation.suggestedFix ? `\n**Suggested Approach:**\n${validation.suggestedFix}` : '',
            validation.relatedFiles?.length
              ? `\n**Related Files:**\n${validation.relatedFiles.map((f) => `- \`${f}\``).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n');

          const feature = {
            id: `issue-${issue.number}-${crypto.randomUUID()}`,
            title: issue.title,
            description,
            category: 'From GitHub',
            status: 'backlog' as const,
            passes: false,
            priority: getFeaturePriority(validation.estimatedComplexity),
            model: 'opus' as const,
            thinkingLevel: 'none' as const,
            branchName: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const result = await api.features.create(currentProject.path, feature);
          if (result.success) {
            toast.success(`Created task: ${issue.title}`);
          } else {
            toast.error(result.error || 'Failed to create task');
          }
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Convert to task error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create task');
      }
    },
    [currentProject?.path]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-destructive/10 mb-4">
          <CircleDot className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-lg font-medium mb-2">Failed to Load Issues</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  const totalIssues = openIssues.length + closedIssues.length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Issues List */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedIssue ? 'w-80' : 'flex-1'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CircleDot className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Issues</h1>
              <p className="text-xs text-muted-foreground">
                {totalIssues === 0
                  ? 'No issues found'
                  : `${openIssues.length} open, ${closedIssues.length} closed`}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </div>

        {/* Issues List */}
        <div className="flex-1 overflow-auto">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <CircleDot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-base font-medium mb-2">No Issues</h2>
              <p className="text-sm text-muted-foreground">This repository has no issues yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Open Issues */}
              {openIssues.map((issue) => (
                <IssueRow
                  key={issue.number}
                  issue={issue}
                  isSelected={selectedIssue?.number === issue.number}
                  onClick={() => setSelectedIssue(issue)}
                  onOpenExternal={() => handleOpenInGitHub(issue.url)}
                  formatDate={formatDate}
                  cachedValidation={cachedValidations.get(issue.number)}
                  isValidating={validatingIssues.has(issue.number)}
                />
              ))}

              {/* Closed Issues Section */}
              {closedIssues.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Closed Issues ({closedIssues.length})
                  </div>
                  {closedIssues.map((issue) => (
                    <IssueRow
                      key={issue.number}
                      issue={issue}
                      isSelected={selectedIssue?.number === issue.number}
                      onClick={() => setSelectedIssue(issue)}
                      onOpenExternal={() => handleOpenInGitHub(issue.url)}
                      formatDate={formatDate}
                      cachedValidation={cachedValidations.get(issue.number)}
                      isValidating={validatingIssues.has(issue.number)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Issue Detail Panel */}
      {selectedIssue && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Detail Header */}
          <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              {selectedIssue.state === 'OPEN' ? (
                <Circle className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-purple-500 flex-shrink-0" />
              )}
              <span className="text-sm font-medium truncate">
                #{selectedIssue.number} {selectedIssue.title}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(() => {
                const isValidating = validatingIssues.has(selectedIssue.number);
                const cached = cachedValidations.get(selectedIssue.number);
                const isStale =
                  cached &&
                  (Date.now() - new Date(cached.validatedAt).getTime()) / (1000 * 60 * 60) > 24;

                if (isValidating) {
                  return (
                    <Button variant="default" size="sm" disabled>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Validating...
                    </Button>
                  );
                }

                if (cached && !isStale) {
                  return (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewCachedValidation(selectedIssue)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                        View Result
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleValidateIssue(selectedIssue)}
                        title="Re-validate"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </>
                  );
                }

                if (cached && isStale) {
                  return (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewCachedValidation(selectedIssue)}
                      >
                        <Clock className="h-4 w-4 mr-1 text-yellow-500" />
                        View (stale)
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleValidateIssue(selectedIssue)}
                      >
                        <Wand2 className="h-4 w-4 mr-1" />
                        Re-validate
                      </Button>
                    </>
                  );
                }

                return (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleValidateIssue(selectedIssue)}
                  >
                    <Wand2 className="h-4 w-4 mr-1" />
                    Validate with AI
                  </Button>
                );
              })()}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenInGitHub(selectedIssue.url)}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open in GitHub
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIssue(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Issue Detail Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Title */}
            <h1 className="text-xl font-bold mb-2">{selectedIssue.title}</h1>

            {/* Meta info */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  selectedIssue.state === 'OPEN'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-purple-500/10 text-purple-500'
                )}
              >
                {selectedIssue.state === 'OPEN' ? 'Open' : 'Closed'}
              </span>
              <span>
                #{selectedIssue.number} opened {formatDate(selectedIssue.createdAt)} by{' '}
                <span className="font-medium text-foreground">{selectedIssue.author.login}</span>
              </span>
            </div>

            {/* Labels */}
            {selectedIssue.labels.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {selectedIssue.labels.map((label) => (
                  <span
                    key={label.name}
                    className="px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: `#${label.color}20`,
                      color: `#${label.color}`,
                      border: `1px solid #${label.color}40`,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {/* Assignees */}
            {selectedIssue.assignees && selectedIssue.assignees.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Assigned to:</span>
                <div className="flex items-center gap-2">
                  {selectedIssue.assignees.map((assignee) => (
                    <span
                      key={assignee.login}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20"
                    >
                      {assignee.avatarUrl && (
                        <img
                          src={assignee.avatarUrl}
                          alt={assignee.login}
                          className="h-4 w-4 rounded-full"
                        />
                      )}
                      {assignee.login}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Pull Requests */}
            {selectedIssue.linkedPRs && selectedIssue.linkedPRs.length > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <GitPullRequest className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Linked Pull Requests</span>
                </div>
                <div className="space-y-2">
                  {selectedIssue.linkedPRs.map((pr) => (
                    <div key={pr.number} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 text-xs font-medium rounded',
                            pr.state === 'open'
                              ? 'bg-green-500/10 text-green-500'
                              : pr.state === 'merged'
                                ? 'bg-purple-500/10 text-purple-500'
                                : 'bg-red-500/10 text-red-500'
                          )}
                        >
                          {pr.state === 'open'
                            ? 'Open'
                            : pr.state === 'merged'
                              ? 'Merged'
                              : 'Closed'}
                        </span>
                        <span className="text-muted-foreground">#{pr.number}</span>
                        <span className="truncate">{pr.title}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 flex-shrink-0"
                        onClick={() => handleOpenInGitHub(pr.url)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            {selectedIssue.body ? (
              <Markdown className="text-sm">{selectedIssue.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided.</p>
            )}

            {/* Open in GitHub CTA */}
            <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-3">
                View comments, add reactions, and more on GitHub.
              </p>
              <Button onClick={() => handleOpenInGitHub(selectedIssue.url)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full Issue on GitHub
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Dialog */}
      <ValidationDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        issue={selectedIssue}
        validationResult={validationResult}
        isValidating={selectedIssue ? validatingIssues.has(selectedIssue.number) : false}
        onConvertToTask={handleConvertToTask}
      />
    </div>
  );
}

interface IssueRowProps {
  issue: GitHubIssue;
  isSelected: boolean;
  onClick: () => void;
  onOpenExternal: () => void;
  formatDate: (date: string) => string;
  /** Cached validation for this issue (if any) */
  cachedValidation?: StoredValidation | null;
  /** Whether validation is currently running for this issue */
  isValidating?: boolean;
}

function IssueRow({
  issue,
  isSelected,
  onClick,
  onOpenExternal,
  formatDate,
  cachedValidation,
  isValidating,
}: IssueRowProps) {
  // Check if validation is unviewed (exists, not stale, not viewed)
  const hasUnviewedValidation =
    cachedValidation &&
    !cachedValidation.viewedAt &&
    (() => {
      const hoursSince =
        (Date.now() - new Date(cachedValidation.validatedAt).getTime()) / (1000 * 60 * 60);
      return hoursSince <= 24;
    })();
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent'
      )}
      onClick={onClick}
    >
      {issue.state === 'OPEN' ? (
        <Circle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{issue.title}</span>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            #{issue.number} opened {formatDate(issue.createdAt)} by {issue.author.login}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Labels */}
          {issue.labels.map((label) => (
            <span
              key={label.name}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
                border: `1px solid #${label.color}40`,
              }}
            >
              {label.name}
            </span>
          ))}

          {/* Linked PR indicator */}
          {issue.linkedPRs && issue.linkedPRs.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <GitPullRequest className="h-3 w-3" />
              {issue.linkedPRs.length} PR{issue.linkedPRs.length > 1 ? 's' : ''}
            </span>
          )}

          {/* Assignee indicator */}
          {issue.assignees && issue.assignees.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <User className="h-3 w-3" />
              {issue.assignees.map((a) => a.login).join(', ')}
            </span>
          )}

          {/* Validating indicator */}
          {isValidating && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary border border-primary/20 animate-in fade-in duration-200">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </span>
          )}

          {/* Unviewed validation indicator */}
          {!isValidating && hasUnviewedValidation && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-in fade-in duration-200">
              <Sparkles className="h-3 w-3" />
              Analysis Ready
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
