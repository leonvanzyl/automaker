"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Label } from "@/components/ui/label";
import { CategoryAutocomplete } from "@/components/ui/category-autocomplete";
import { BranchAutocomplete } from "@/components/ui/branch-autocomplete";
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from "@/components/ui/description-image-dropzone";
import {
  MessageSquare,
  Settings2,
  FlaskConical,
  Sparkles,
  ChevronDown,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { getElectronAPI } from "@/lib/electron";
import { modelSupportsThinking } from "@/lib/utils";
import {
  Feature,
  AgentModel,
  ThinkingLevel,
  AIProfile,
  useAppStore,
} from "@/store/app-store";
import {
  ModelSelector,
  ThinkingLevelSelector,
  ProfileQuickSelect,
  TestingTabContent,
  PrioritySelector,
} from "../shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DependencyTreeDialog } from "./dependency-tree-dialog";

interface EditFeatureDialogProps {
  feature: Feature | null;
  onClose: () => void;
  onUpdate: (
    featureId: string,
    updates: {
      category: string;
      description: string;
      steps: string[];
      skipTests: boolean;
      model: AgentModel;
      thinkingLevel: ThinkingLevel;
      imagePaths: DescriptionImagePath[];
      branchName: string;
      priority: number;
    }
  ) => void;
  categorySuggestions: string[];
  branchSuggestions: string[];
  isMaximized: boolean;
  showProfilesOnly: boolean;
  aiProfiles: AIProfile[];
  allFeatures: Feature[];
}

export function EditFeatureDialog({
  feature,
  onClose,
  onUpdate,
  categorySuggestions,
  branchSuggestions,
  isMaximized,
  showProfilesOnly,
  aiProfiles,
  allFeatures,
}: EditFeatureDialogProps) {
  const [editingFeature, setEditingFeature] = useState<Feature | null>(feature);
  const [editFeaturePreviewMap, setEditFeaturePreviewMap] =
    useState<ImagePreviewMap>(() => new Map());
  const [showEditAdvancedOptions, setShowEditAdvancedOptions] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancementMode, setEnhancementMode] = useState<
    "improve" | "technical" | "simplify" | "acceptance"
  >("improve");
  const [showDependencyTree, setShowDependencyTree] = useState(false);

  // Get enhancement model and worktrees setting from store
  const { enhancementModel, useWorktrees } = useAppStore();

  useEffect(() => {
    setEditingFeature(feature);
    if (!feature) {
      setEditFeaturePreviewMap(new Map());
      setShowEditAdvancedOptions(false);
    }
  }, [feature]);

  const handleUpdate = () => {
    if (!editingFeature) return;

    const selectedModel = (editingFeature.model ?? "opus") as AgentModel;
    const normalizedThinking: ThinkingLevel = modelSupportsThinking(
      selectedModel
    )
      ? editingFeature.thinkingLevel ?? "none"
      : "none";

    const updates = {
      category: editingFeature.category,
      description: editingFeature.description,
      steps: editingFeature.steps,
      skipTests: editingFeature.skipTests ?? false,
      model: selectedModel,
      thinkingLevel: normalizedThinking,
      imagePaths: editingFeature.imagePaths ?? [],
      branchName: editingFeature.branchName ?? "main",
      priority: editingFeature.priority ?? 2,
    };

    onUpdate(editingFeature.id, updates);
    setEditFeaturePreviewMap(new Map());
    setShowEditAdvancedOptions(false);
    onClose();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleModelSelect = (model: AgentModel) => {
    if (!editingFeature) return;
    setEditingFeature({
      ...editingFeature,
      model,
      thinkingLevel: modelSupportsThinking(model)
        ? editingFeature.thinkingLevel
        : "none",
    });
  };

  const handleProfileSelect = (
    model: AgentModel,
    thinkingLevel: ThinkingLevel
  ) => {
    if (!editingFeature) return;
    setEditingFeature({
      ...editingFeature,
      model,
      thinkingLevel,
    });
  };

  const handleEnhanceDescription = async () => {
    if (!editingFeature?.description.trim() || isEnhancing) return;

    setIsEnhancing(true);
    try {
      const api = getElectronAPI();
      const result = await api.enhancePrompt?.enhance(
        editingFeature.description,
        enhancementMode,
        enhancementModel
      );

      if (result?.success && result.enhancedText) {
        const enhancedText = result.enhancedText;
        setEditingFeature((prev) =>
          prev ? { ...prev, description: enhancedText } : prev
        );
        toast.success("Description enhanced!");
      } else {
        toast.error(result?.error || "Failed to enhance description");
      }
    } catch (error) {
      console.error("Enhancement failed:", error);
      toast.error("Failed to enhance description");
    } finally {
      setIsEnhancing(false);
    }
  };

  const editModelAllowsThinking = modelSupportsThinking(editingFeature?.model);

  if (!editingFeature) {
    return null;
  }

  return (
    <Dialog open={!!editingFeature} onOpenChange={handleDialogClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="edit-feature-dialog"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-testid="category-autocomplete-list"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Feature</DialogTitle>
          <DialogDescription>Modify the feature details.</DialogDescription>
        </DialogHeader>
        <Tabs
          defaultValue="prompt"
          className="py-4 flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="prompt" data-testid="edit-tab-prompt">
              <MessageSquare className="w-4 h-4 mr-2" />
              Prompt
            </TabsTrigger>
            <TabsTrigger value="model" data-testid="edit-tab-model">
              <Settings2 className="w-4 h-4 mr-2" />
              Model
            </TabsTrigger>
            <TabsTrigger value="testing" data-testid="edit-tab-testing">
              <FlaskConical className="w-4 h-4 mr-2" />
              Testing
            </TabsTrigger>
          </TabsList>

          {/* Prompt Tab */}
          <TabsContent
            value="prompt"
            className="space-y-4 overflow-y-auto cursor-default"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <DescriptionImageDropZone
                value={editingFeature.description}
                onChange={(value) =>
                  setEditingFeature({
                    ...editingFeature,
                    description: value,
                  })
                }
                images={editingFeature.imagePaths ?? []}
                onImagesChange={(images) =>
                  setEditingFeature({
                    ...editingFeature,
                    imagePaths: images,
                  })
                }
                placeholder="Describe the feature..."
                previewMap={editFeaturePreviewMap}
                onPreviewMapChange={setEditFeaturePreviewMap}
                data-testid="edit-feature-description"
              />
            </div>
            <div className="flex w-fit items-center gap-3 select-none cursor-default">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-[180px] justify-between"
                  >
                    {enhancementMode === "improve" && "Improve Clarity"}
                    {enhancementMode === "technical" && "Add Technical Details"}
                    {enhancementMode === "simplify" && "Simplify"}
                    {enhancementMode === "acceptance" &&
                      "Add Acceptance Criteria"}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => setEnhancementMode("improve")}
                  >
                    Improve Clarity
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setEnhancementMode("technical")}
                  >
                    Add Technical Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setEnhancementMode("simplify")}
                  >
                    Simplify
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setEnhancementMode("acceptance")}
                  >
                    Add Acceptance Criteria
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEnhanceDescription}
                disabled={!editingFeature.description.trim() || isEnhancing}
                loading={isEnhancing}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Enhance with AI
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category (optional)</Label>
              <CategoryAutocomplete
                value={editingFeature.category}
                onChange={(value) =>
                  setEditingFeature({
                    ...editingFeature,
                    category: value,
                  })
                }
                suggestions={categorySuggestions}
                placeholder="e.g., Core, UI, API"
                data-testid="edit-feature-category"
              />
            </div>
            {useWorktrees && (
              <div className="space-y-2">
                <Label htmlFor="edit-branch">Target Branch</Label>
                <BranchAutocomplete
                  value={editingFeature.branchName ?? "main"}
                  onChange={(value) =>
                    setEditingFeature({
                      ...editingFeature,
                      branchName: value,
                    })
                  }
                  branches={branchSuggestions}
                  placeholder="Select or create branch..."
                  data-testid="edit-feature-branch"
                  disabled={editingFeature.status !== "backlog"}
                />
                {editingFeature.status !== "backlog" && (
                  <p className="text-xs text-muted-foreground">
                    Branch cannot be changed after work has started.
                  </p>
                )}
                {editingFeature.status === "backlog" && (
                  <p className="text-xs text-muted-foreground">
                    Work will be done in this branch. A worktree will be created
                    if needed.
                  </p>
                )}
              </div>
            )}

            {/* Priority Selector */}
            <PrioritySelector
              selectedPriority={editingFeature.priority ?? 2}
              onPrioritySelect={(priority) =>
                setEditingFeature({
                  ...editingFeature,
                  priority,
                })
              }
              testIdPrefix="edit-priority"
            />
          </TabsContent>

          {/* Model Tab */}
          <TabsContent
            value="model"
            className="space-y-4 overflow-y-auto cursor-default"
          >
            {/* Show Advanced Options Toggle */}
            {showProfilesOnly && (
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Simple Mode Active
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Only showing AI profiles. Advanced model tweaking is hidden.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setShowEditAdvancedOptions(!showEditAdvancedOptions)
                  }
                  data-testid="edit-show-advanced-options-toggle"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  {showEditAdvancedOptions ? "Hide" : "Show"} Advanced
                </Button>
              </div>
            )}

            {/* Quick Select Profile Section */}
            <ProfileQuickSelect
              profiles={aiProfiles}
              selectedModel={editingFeature.model ?? "opus"}
              selectedThinkingLevel={editingFeature.thinkingLevel ?? "none"}
              onSelect={handleProfileSelect}
              testIdPrefix="edit-profile-quick-select"
            />

            {/* Separator */}
            {aiProfiles.length > 0 &&
              (!showProfilesOnly || showEditAdvancedOptions) && (
                <div className="border-t border-border" />
              )}

            {/* Claude Models Section */}
            {(!showProfilesOnly || showEditAdvancedOptions) && (
              <>
                <ModelSelector
                  selectedModel={(editingFeature.model ?? "opus") as AgentModel}
                  onModelSelect={handleModelSelect}
                  testIdPrefix="edit-model-select"
                />
                {editModelAllowsThinking && (
                  <ThinkingLevelSelector
                    selectedLevel={editingFeature.thinkingLevel ?? "none"}
                    onLevelSelect={(level) =>
                      setEditingFeature({
                        ...editingFeature,
                        thinkingLevel: level,
                      })
                    }
                    testIdPrefix="edit-thinking-level"
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Testing Tab */}
          <TabsContent
            value="testing"
            className="space-y-4 overflow-y-auto cursor-default"
          >
            <TestingTabContent
              skipTests={editingFeature.skipTests ?? false}
              onSkipTestsChange={(skipTests) =>
                setEditingFeature({ ...editingFeature, skipTests })
              }
              steps={editingFeature.steps}
              onStepsChange={(steps) =>
                setEditingFeature({ ...editingFeature, steps })
              }
              testIdPrefix="edit"
            />
          </TabsContent>
        </Tabs>
        <DialogFooter className="sm:!justify-between">
          <Button
            variant="outline"
            onClick={() => setShowDependencyTree(true)}
            className="gap-2 h-10"
          >
            <GitBranch className="w-4 h-4" />
            View Dependency Tree
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleUpdate}
              hotkey={{ key: "Enter", cmdCtrl: true }}
              hotkeyActive={!!editingFeature}
              data-testid="confirm-edit-feature"
            >
              Save Changes
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>

      <DependencyTreeDialog
        open={showDependencyTree}
        onClose={() => setShowDependencyTree(false)}
        feature={editingFeature}
        allFeatures={allFeatures}
      />
    </Dialog>
  );
}
