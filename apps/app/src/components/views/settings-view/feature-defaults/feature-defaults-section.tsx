import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FlaskConical, Settings2, TestTube, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureDefaultsSectionProps {
  showProfilesOnly: boolean;
  defaultSkipTests: boolean;
  useWorktrees: boolean;
  onShowProfilesOnlyChange: (value: boolean) => void;
  onDefaultSkipTestsChange: (value: boolean) => void;
  onUseWorktreesChange: (value: boolean) => void;
}

export function FeatureDefaultsSection({
  showProfilesOnly,
  defaultSkipTests,
  useWorktrees,
  onShowProfilesOnlyChange,
  onDefaultSkipTestsChange,
  onUseWorktreesChange,
}: FeatureDefaultsSectionProps) {
  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden",
        "border border-border/50",
        "bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl",
        "shadow-sm shadow-black/5"
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <FlaskConical className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Feature Defaults
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure default settings for new features.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {/* Profiles Only Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="show-profiles-only"
            checked={showProfilesOnly}
            onCheckedChange={(checked) =>
              onShowProfilesOnlyChange(checked === true)
            }
            className="mt-1"
            data-testid="show-profiles-only-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="show-profiles-only"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4 text-brand-500" />
              Show profiles only by default
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, the Add Feature dialog will show only AI profiles
              and hide advanced model tweaking options. This creates a cleaner, less
              overwhelming UI.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Automated Testing Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="default-skip-tests"
            checked={!defaultSkipTests}
            onCheckedChange={(checked) =>
              onDefaultSkipTestsChange(checked !== true)
            }
            className="mt-1"
            data-testid="default-skip-tests-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="default-skip-tests"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <TestTube className="w-4 h-4 text-brand-500" />
              Enable automated testing by default
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, new features will use TDD with automated tests. When disabled, features will
              require manual verification.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Worktree Isolation Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="use-worktrees"
            checked={useWorktrees}
            onCheckedChange={(checked) =>
              onUseWorktreesChange(checked === true)
            }
            className="mt-1"
            data-testid="use-worktrees-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="use-worktrees"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4 text-brand-500" />
              Enable Git Worktree Isolation
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/20 font-medium">
                experimental
              </span>
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Creates isolated git branches for each feature. When disabled,
              agents work directly in the main project directory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
