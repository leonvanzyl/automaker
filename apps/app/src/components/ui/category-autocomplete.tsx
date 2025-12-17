"use client";

import * as React from "react";
import { Autocomplete } from "@/components/ui/autocomplete";

interface CategoryAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function CategoryAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder = "Select or type a category...",
  className,
  disabled = false,
  "data-testid": testId,
}: CategoryAutocompleteProps) {
  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={suggestions}
      placeholder={placeholder}
      searchPlaceholder="Search category..."
      emptyMessage="No category found."
      className={className}
      disabled={disabled}
      data-testid={testId}
      itemTestIdPrefix="category-option"
    />
  );
}
