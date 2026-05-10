# Polish Pass — Animations, Haptics, Micro-Interactions Design Spec

**Date:** 2026-05-10  
**Scope:** Animations, haptics, micro-interactions, visual refinement  
**Approach:** CSS-first animations, haptics utility expansion, consistent interaction patterns

---

## 1. Problem Statement

The app is functional but lacks polish:
- Page transitions are instant and jarring.
- Loading states show nothing or a generic spinner.
- Button taps have no physical feedback.
- Cards appear instantly without entrance animation.
- Pull-to-refresh exists but feels basic.

## 2. Design Goals

1. **Smooth page transitions** — Fade/slide between tabs.
2. **Skeleton loaders** — Show structure before data loads.
3. **Button micro-interactions** — Scale + haptic on tap.
4. **Card entrance animations** — Staggered fade-up on scroll.
5. **Enhanced pull-to-refresh** — Elastic pull with haptic snap.

## 3. Layout & Components

### Page Transitions

Add `PageTransition` wrapper:
- Uses React key on route change.
- Old page fades out (150ms), new page fades in + slides up (200ms).
- Uses CSS transitions, no JS animation library.
- Respects `prefers-reduced-motion`.

### Skeleton Loaders

New `Skeleton` component (already exists but basic):
- Enhance with `animate-shimmer` utility.
- Variants: `text`, `card`, `chart`, `list`.
- Used on dashboard while data hydrates, on Tax tab while calculations run.

### Button Micro-Interactions

Enhance existing button classes:
- `active:scale-95` already exists; add haptic `triggerHaptic('light')` on click.
- Primary buttons: `hover:brightness-110` glow effect.
- Destructive buttons: `hover:bg-red-500/20` transition.
- Icon buttons: `hover:rotate-12` on settings gear, etc.

### Card Entrance Animations

New `AnimateInView` utility:
- Wraps any component.
- Uses `IntersectionObserver`.
- When card enters viewport, applies `animate-fade-up` with staggered delay.
- Configurable delay: `0ms`, `50ms`, `100ms`, `150ms`.

### Pull-to-Refresh Enhancement

Modify `PullToRefreshIndicator`:
- Add elastic resistance curve (the further you pull, the harder it resists).
- Haptic snap when threshold crossed (`triggerHaptic('medium')`).
- Release animation: snap back with spring physics (CSS `cubic-bezier`).
- Loading state: pulsing brand-colored spinner.

### Toast System

New `Toast` component (basic one exists):
- Stack toasts vertically.
- Entrance: slide in from top.
- Auto-dismiss after 4s with progress bar.
- Types: success (green), error (red), info (blue), warning (amber).
- Haptic: `triggerHaptic('light')` on toast show.

## 4. Data Flow

- No data changes. Purely presentational.
- Haptics utility already exists; expand usage.
- Page transitions triggered by `AppShell` route changes.

## 5. Component Breakdown

### New/Enhanced Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `PageTransition` | `components/PageTransition.tsx` | Wraps route content with fade/slide transition. |
| `Skeleton` | `components/Skeleton.tsx` | Already exists; enhance with variants and shimmer. |
| `AnimateInView` | `components/AnimateInView.tsx` | IntersectionObserver wrapper for entrance animations. |
| `Toast` | `components/Toast.tsx` | Already exists; enhance with stacking, progress bar, types. |
| `PullToRefreshIndicator` | `components/PullToRefreshIndicator.tsx` | Already exists; enhance with elastic pull and haptic snap. |

### Modified Components

| Component | Change |
|-----------|--------|
| `AppShell.tsx` | Wrap route content in `PageTransition`. |
| `DashboardScreen.tsx` | Wrap cards in `AnimateInView` with staggered delays. |
| `TaxLogic.tsx` | Add `Skeleton` loaders for chart sections. |
| `utils/ui.ts` | Add haptic trigger to button base classes. |
| `index.css` | Add `animate-shimmer`, spring easing curves. |

## 6. Empty States

- Skeletons: Show while data loads; replaced by real content.
- Toasts: Used for success/error feedback on all async actions.

## 7. Accessibility & Performance

- All animations respect `prefers-reduced-motion`.
- Haptics are optional; no-op if `navigator.vibrate` unavailable.
- CSS-only animations; no JS animation libraries.
- IntersectionObserver is lazy; no performance impact.

## 8. Out of Scope

- Complex physics engines (spring animations beyond CSS).
- Lottie or GIF animations.
- Background animations or particle effects.

## 9. Success Criteria

- [ ] Page transitions feel smooth (not instant).
- [ ] Dashboard cards animate in on scroll with stagger.
- [ ] Every button tap triggers a light haptic.
- [ ] Pull-to-refresh has elastic resistance and haptic snap.
- [ ] Toasts stack and auto-dismiss.
- [ ] Skeleton loaders match card structure.
- [ ] All animations respect `prefers-reduced-motion`.
