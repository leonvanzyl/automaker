"use client";

import { useSetupStore } from "@/store/setup-store";
import { useAppStore } from "@/store/app-store";
import { StepIndicator } from "./setup-view/components";
import {
  WelcomeStep,
  CompleteStep,
  ClaudeSetupStep,
  GitHubSetupStep,
} from "./setup-view/steps";

// Main Setup View
export function SetupView() {
  const {
    currentStep,
    setCurrentStep,
    completeSetup,
    setSkipClaudeSetup,
  } = useSetupStore();
  const { setCurrentView } = useAppStore();

  const steps = ["welcome", "claude", "github", "complete"] as const;
  type StepName = (typeof steps)[number];
  const getStepName = (): StepName => {
    if (currentStep === "claude_detect" || currentStep === "claude_auth")
      return "claude";
    if (currentStep === "welcome") return "welcome";
    if (currentStep === "github") return "github";
    return "complete";
  };
  const currentIndex = steps.indexOf(getStepName());

  const handleNext = (from: string) => {
    console.log(
      "[Setup Flow] handleNext called from:",
      from,
      "currentStep:",
      currentStep
    );
    switch (from) {
      case "welcome":
        console.log("[Setup Flow] Moving to claude_detect step");
        setCurrentStep("claude_detect");
        break;
      case "claude":
        console.log("[Setup Flow] Moving to github step");
        setCurrentStep("github");
        break;
      case "github":
        console.log("[Setup Flow] Moving to complete step");
        setCurrentStep("complete");
        break;
    }
  };

  const handleBack = (from: string) => {
    console.log("[Setup Flow] handleBack called from:", from);
    switch (from) {
      case "claude":
        setCurrentStep("welcome");
        break;
      case "github":
        setCurrentStep("claude_detect");
        break;
    }
  };

  const handleSkipClaude = () => {
    console.log("[Setup Flow] Skipping Claude setup");
    setSkipClaudeSetup(true);
    setCurrentStep("github");
  };

  const handleSkipGithub = () => {
    console.log("[Setup Flow] Skipping GitHub setup");
    setCurrentStep("complete");
  };

  const handleFinish = () => {
    console.log("[Setup Flow] handleFinish called - completing setup");
    completeSetup();
    console.log("[Setup Flow] Setup completed, redirecting to welcome view");
    setCurrentView("welcome");
  };

  return (
    <div className="h-full flex flex-col content-bg" data-testid="setup-view">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-glass backdrop-blur-md titlebar-drag-region">
        <div className="px-8 py-4">
          <div className="flex items-center gap-3 titlebar-no-drag">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Automaker" className="w-8 h-8" />
            <span className="text-lg font-semibold text-foreground">
              Automaker Setup
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-8">
          <div className="w-full max-w-2xl mx-auto">
            <div className="mb-8">
              <StepIndicator
                currentStep={currentIndex}
                totalSteps={steps.length}
              />
            </div>

            <div className="py-8">
              {currentStep === "welcome" && (
                <WelcomeStep onNext={() => handleNext("welcome")} />
              )}

              {(currentStep === "claude_detect" ||
                currentStep === "claude_auth") && (
                <ClaudeSetupStep
                  onNext={() => handleNext("claude")}
                  onBack={() => handleBack("claude")}
                  onSkip={handleSkipClaude}
                />
              )}

              {currentStep === "github" && (
                <GitHubSetupStep
                  onNext={() => handleNext("github")}
                  onBack={() => handleBack("github")}
                  onSkip={handleSkipGithub}
                />
              )}

              {currentStep === "complete" && (
                <CompleteStep onFinish={handleFinish} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
