# Implementation Plan: Fix Mobile Model Selection

## Problem Statement
Users cannot change the model when creating a new task on mobile devices. The model selector uses fixed-width Radix UI Popovers with nested secondary popovers that extend to the right, causing the interface to go off-screen on mobile devices (typically 375-428px width).

## Root Cause Analysis

### Current Implementation Issues:
1. **Fixed Widths**: Main popover is 320px, secondary popovers are 220px
2. **Horizontal Nesting**: Secondary popovers (thinking levels, reasoning effort, cursor variants) position to the right of the main popover
3. **No Collision Handling**: Radix Popover doesn't have sufficient collision padding configured
4. **No Mobile-Specific UI**: Same component used for all screen sizes

### Affected Files:
- `/apps/ui/src/components/views/settings-view/model-defaults/phase-model-selector.tsx` - Core implementation
- `/apps/ui/src/components/views/agent-view/shared/agent-model-selector.tsx` - Wrapper for agent view
- `/apps/ui/src/components/views/agent-view/input-area/input-controls.tsx` - Usage location

## Proposed Solution: Responsive Popover with Mobile Optimization

### Approach: Add Responsive Width & Collision Handling

**Rationale**: Minimal changes, maximum compatibility, leverages existing Radix UI features

### Implementation Steps:

#### 1. Create a Custom Hook for Mobile Detection
**File**: `/apps/ui/src/hooks/use-mobile.ts` (new file)

```typescript
import { useEffect, useState } from 'react';

export function useMobile(breakpoint: number = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

    const handleChange = () => {
      setIsMobile(mediaQuery.matches);
    };

    // Set initial value
    handleChange();

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [breakpoint]);

  return isMobile;
}
```

**Why**: Follows existing pattern from `use-sidebar-auto-collapse.ts`, reusable across components

#### 2. Update Phase Model Selector with Responsive Behavior
**File**: `/apps/ui/src/components/views/settings-view/model-defaults/phase-model-selector.tsx`

**Changes**:
- Import and use `useMobile()` hook
- Apply responsive widths:
  - Mobile: `w-[calc(100vw-32px)] max-w-[340px]` (full width with padding)
  - Desktop: `w-80` (320px - current)
- Add collision handling to Radix Popover:
  - `collisionPadding={16}` - Prevent edge overflow
  - `avoidCollisions={true}` - Enable collision detection
  - `sideOffset={4}` - Add spacing from trigger
- Secondary popovers:
  - Mobile: Position `side="bottom"` instead of `side="right"`
  - Desktop: Keep `side="right"` (current behavior)
  - Mobile width: `w-[calc(100vw-32px)] max-w-[340px]`
  - Desktop width: `w-[220px]` (current)

**Specific Code Changes**:
```typescript
// Add at top of component
const isMobile = useMobile(768);

// Main popover content
<PopoverContent
  className={cn(
    isMobile ? "w-[calc(100vw-32px)] max-w-[340px]" : "w-80",
    "p-0"
  )}
  collisionPadding={16}
  avoidCollisions={true}
  sideOffset={4}
>

// Secondary popovers (thinking level, reasoning effort, etc.)
<PopoverContent
  side={isMobile ? "bottom" : "right"}
  className={cn(
    isMobile ? "w-[calc(100vw-32px)] max-w-[340px]" : "w-[220px]",
    "p-2"
  )}
  collisionPadding={16}
  avoidCollisions={true}
  sideOffset={4}
>
```

#### 3. Test Responsive Behavior

**Test Cases**:
- [ ] Mobile (< 768px): Popovers fit within screen, secondary popovers open below
- [ ] Tablet (768-1024px): Popovers use optimal width
- [ ] Desktop (> 1024px): Current behavior preserved
- [ ] Edge cases: Very narrow screens (320px), screen rotation
- [ ] Functionality: All model selections work correctly on all screen sizes

## Alternative Approaches Considered

### Alternative 1: Use Sheet Component for Mobile
**Pros**: Better mobile UX, full-screen takeover common pattern
**Cons**: Requires duplicating component logic, more complex state management, different UX between mobile/desktop

**Verdict**: Rejected - Too much complexity for the benefit

### Alternative 2: Simplify Mobile UI (Remove Nested Popovers)
**Pros**: Simpler mobile interface
**Cons**: Removes functionality (thinking levels, reasoning effort) on mobile, poor UX

**Verdict**: Rejected - Removes essential features

### Alternative 3: Horizontal Scrolling Container
**Pros**: Preserves exact desktop layout
**Cons**: Poor mobile UX, non-standard pattern, accessibility issues

**Verdict**: Rejected - Bad mobile UX

## Technical Considerations

### Breakpoint Selection
- **768px chosen**: Standard tablet breakpoint
- Matches pattern in existing codebase (`use-sidebar-auto-collapse.ts` uses 1024px)
- Covers iPhone SE (375px) through iPhone 14 Pro Max (428px)

### Collision Handling
- `collisionPadding={16}`: 16px buffer from edges (standard spacing)
- `avoidCollisions={true}`: Radix will automatically reposition if needed
- `sideOffset={4}`: Small gap between trigger and popover

### Performance
- `useMobile` hook uses `window.matchMedia` (performant, native API)
- Re-renders only on breakpoint changes (not every resize)
- No additional dependencies

### Compatibility
- Works with existing compact/full modes
- Preserves all functionality
- No breaking changes to props/API
- Compatible with existing styles

## Implementation Checklist

- [ ] Create `/apps/ui/src/hooks/use-mobile.ts`
- [ ] Update `phase-model-selector.tsx` with responsive behavior
- [ ] Test on mobile devices/emulators (Chrome DevTools)
- [ ] Test on tablet breakpoint
- [ ] Test on desktop (ensure no regression)
- [ ] Verify all model variants are selectable
- [ ] Check nested popovers (thinking level, reasoning effort, cursor)
- [ ] Verify compact mode still works in agent view
- [ ] Test keyboard navigation
- [ ] Test with touch interactions

## Rollback Plan
If issues arise:
1. Revert `phase-model-selector.tsx` changes
2. Remove `use-mobile.ts` hook
3. Original functionality immediately restored

## Success Criteria
✅ Users can select any model on mobile devices (< 768px width)
✅ All nested popover options are accessible on mobile
✅ Desktop behavior unchanged (no regressions)
✅ UI fits within viewport on all screen sizes (320px+)
✅ No horizontal scrolling required
✅ Touch interactions work correctly

## Estimated Effort
- Implementation: 30-45 minutes
- Testing: 15-20 minutes
- **Total**: ~1 hour

## Dependencies
None - uses existing Radix UI Popover features

## Risks & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaks desktop layout | Low | Medium | Thorough testing, conditional logic |
| Poor mobile UX | Low | Medium | Follow mobile-first best practices |
| Touch interaction issues | Low | Low | Use Radix UI touch handlers |
| Breakpoint conflicts | Low | Low | Use standard 768px breakpoint |

## Notes for Developer
- The `compact` prop in `agent-model-selector.tsx` is preserved and still works
- All existing functionality (thinking levels, reasoning effort, cursor variants) remains
- Only visual layout changes on mobile - no logic changes
- Consider adding this pattern to other popovers if successful
