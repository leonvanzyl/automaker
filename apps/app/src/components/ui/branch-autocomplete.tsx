"use client";

import * as React from "react";
import { GitBranch } from "lucide-react";
import { Autocomplete, AutocompleteOption } from "@/components/ui/autocomplete";

interface BranchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  branches: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function BranchAutocomplete({
  value,
  onChange,
  branches,
  placeholder = "Select a branch...",
  className,
  disabled = false,
  "data-testid": testId,
}: BranchAutocompleteProps) {
  // Always include "main" at the top of suggestions
  const branchOptions: AutocompleteOption[] = React.useMemo(() => {
    const branchSet = new Set(["main", ...branches]);
    return Array.from(branchSet).map((branch) => ({
      value: branch,
      label: branch,
      badge: branch === "main" ? "default" : undefined,
    }));
  }, [branches]);

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={branchOptions}
      placeholder={placeholder}
      searchPlaceholder="Search or type new branch..."
      emptyMessage="No branches found."
      className={className}
      disabled={disabled}
      icon={GitBranch}
      allowCreate
      createLabel={(v) => `Create "${v}"`}
      data-testid={testId}
      itemTestIdPrefix="branch-option"
    />
  );
}
