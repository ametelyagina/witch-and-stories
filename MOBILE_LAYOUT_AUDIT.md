# Mobile Layout Audit

## Goal

Collect reproducible mobile issues before refactoring the layout.

This document is the context pack for fixing the current mobile experience.

## Audit Scope

Audit date:

- 2026-03-17

Tooling used:

- Playwright mobile emulation
- local app instance from the current repo build

Devices checked:

- iPhone SE
- iPhone 12
- Pixel 7

Scenarios checked:

- empty home screen
- text layer selected
- image picker open

Important note:

- the local clone currently has no configured git remote, so the exact GitHub Pages URL was not discoverable from repo metadata
- the audit was run against the current local app bundle, which reproduces the same responsive layout logic as the deployed build

## Artifacts

Screenshots:

- `artifacts/mobile-audit/iphone-se-home.png`
- `artifacts/mobile-audit/iphone-12-home.png`
- `artifacts/mobile-audit/pixel-7-home.png`
- `artifacts/mobile-audit/iphone-12-text-layer.png`
- `artifacts/mobile-audit/iphone-12-image-picker.png`
- `artifacts/mobile-audit/iphone-12-home-fixed.png`
- `artifacts/mobile-audit/iphone-12-text-fixed.png`
- `artifacts/mobile-audit/iphone-12-image-picker-fixed.png`

Reusable Playwright runner scaffold:

- `scripts/mobile-audit.mjs`

Follow-up audit artifacts after the mobile fix passes:

- `artifacts/mobile-audit-pass2/`
- `artifacts/mobile-audit-pass3/`

## Remediation Status

Status date:

- 2026-03-17

The audit runner was corrected before the second pass:

- the original script used `iPhone` device descriptors with `chromium`, which produced inconsistent viewport readings for this repo
- the current runner now uses explicit mobile viewport profiles (`390x844`, `412x915`, `375x667`) and keeps collecting screenshots and metrics even if one scenario fails

What is now fixed:

1. the action rail no longer fails mobile interaction tests
2. the text-layer properties panel no longer renders every control section at once on phone
3. the image picker stays inside a bounded sheet and the preview no longer collapses on iPhone SE

Measured improvement from the repeated audit:

- selected text sidebar height went from `1964px` down to `807.5px`
- selected text total page height dropped from `4416px` in the earlier pass to `3330px`
- image picker preview shell on iPhone SE grew from `56px` high in pass 2 to `240px` high in pass 3

What is still not fully “done done”:

- the full page remains long on mobile because a real `9:16 canvas` is intentionally large and the secondary tools still live below it
- the image picker is now usable, but it still feels like a compact sheet rather than a fully native step-by-step mobile flow
- the mobile properties panel is much shorter, but only the active tab is compact; richer controls will likely need their own phone-first treatments as text styling grows

## Executive Summary

The mobile problem is not one bad margin.

There are at least three structural issues:

1. the canvas/editor stage is scaled from the leftover viewport height after everything above it is rendered
2. the mobile information architecture stacks desktop sections vertically without reprioritizing them
3. the image picker modal keeps desktop complexity and becomes a huge scroll wall on phone

Because of that, the first screen on mobile is mostly:

- branding
- a tall action rail
- almost no usable canvas

Then, once text is selected, the properties panel becomes a very long vertical form and the interaction model collapses.

## Explicit Failures

### 1. The canvas becomes tiny and effectively unusable on mobile

Evidence:

- iPhone 12: viewport height `664`, canvas column starts at `y = 822.97`, canvas wrap starts at `y = 904.97`
- iPhone SE: viewport height `568`, canvas column starts at `y = 881.94`, canvas wrap starts at `y = 963.94`

What that means:

- by the time the canvas is measured, it is already below the first screen
- the current scale calculation treats that as “very little height left”
- the stage shrinks to a tiny preview instead of a working canvas

Primary code cause:

- `src/App.tsx:59-67`

```ts
const wrapperBounds = wrapper.getBoundingClientRect();
const availableHeight = Math.max(220, window.innerHeight - wrapperBounds.top - 44);
```

Why this breaks mobile:

- on desktop the canvas is visible high enough on the page, so this logic looks fine
- on mobile the canvas sits below long sections, so `wrapperBounds.top` is already larger than the viewport height
- the result is a fake “available height” floor of `220`, which forces the story canvas to render tiny

Severity:

- P0

### 2. The action rail consumes most of the first screen

Evidence:

- iPhone 12: action rail height `546`
- iPhone SE: action rail height `546`

What the user sees:

- five very large buttons stacked vertically
- the actual editor stage is pushed far below the fold
- the primary work area is not the primary thing on screen

Primary code cause:

- `src/index.css:824-826`

```css
.action-rail {
  grid-template-columns: 1fr;
}
```

Combined with:

- `src/index.css:272-275`

```css
.action-rail-button {
  width: 88px;
  min-height: 88px;
}
```

Severity:

- P0

### 3. Selecting text turns the right-side controls panel into a giant mobile scroll wall

Evidence:

- iPhone 12 with selected text: total page height `3289`
- sidebar height alone: `1964`

What the user sees:

- the panel is no longer a quick control area
- it becomes a long desktop form stacked under the canvas
- preset cards + typography controls + transforms all pile into one column

Severity:

- P0

### 4. The image picker is not a usable mobile modal

Evidence:

- iPhone 12 image picker height `1449.66`
- viewport height only `664`
- image picker sidebar section height `623`

What this means:

- the modal is taller than the screen by more than 2x
- the crop flow becomes a long scroll document instead of a focused mobile step
- users are forced to manage preview, options, ratios, and actions in a vertically stretched sheet

Primary code causes:

- `src/index.css:551-565`
- `src/index.css:832-835`

```css
.image-picker {
  max-height: min(92vh, 980px);
  overflow: hidden;
}

@media (max-width: 720px) {
  .image-picker {
    max-height: none;
    overflow: visible;
  }
}
```

Severity:

- P0

## Less Obvious But Still Serious Problems

### 5. Mobile layout is a desktop information architecture collapsed into one column

Symptoms:

- brand header first
- action rail second
- canvas third
- properties fourth

Problem:

- mobile should prioritize the editor stage and the current task
- the current order prioritizes branding and command inventory instead of actual editing

Severity:

- P1

### 6. Topbar is still too tall for mobile

Evidence:

- iPhone 12 topbar height `228.97`
- iPhone SE topbar height `287.94`

Effect:

- precious mobile height is lost before the user reaches any editing surface

Severity:

- P1

### 7. The mobile canvas is visually present but functionally not “editable”

Symptoms:

- the stage is reduced to a preview-sized rectangle
- it is visible, but not comfortable for drag, selection, or composition work

Problem:

- the app technically renders the canvas
- the user experience still fails because the editor stage is too small to manipulate precisely

Severity:

- P1

### 8. Text preset cards are expensive on mobile because they stay in the long panel instead of becoming a focused picker

Effect:

- after selecting text, the user gets a large panel with cards, sliders, color picker, textarea, font select
- this is workable on desktop but heavy on a phone

Severity:

- P1

### 9. The modal and main page use different mobile strategies

Problem:

- main editor collapses to a long page
- image picker also collapses to a long page
- neither one becomes a true mobile-native focused flow

Consequence:

- the whole product feels like a desktop editor squeezed into phone width

Severity:

- P1

## Root Cause Map

### Root Cause A: Canvas scale is tied to viewport remainder instead of editor context

File:

- `src/App.tsx:59-67`

Impact:

- tiny story canvas on mobile
- editor stage becomes unusable even when width is available

### Root Cause B: Mobile only changes columns, not product hierarchy

Files:

- `src/index.css:731-766`
- `src/index.css:769-839`

Impact:

- everything stacks vertically
- nothing becomes task-prioritized

### Root Cause C: Desktop-sized controls keep their visual weight on phone

Files:

- `src/index.css:261-284`
- `src/index.css:472-526`
- `src/components/PropertiesPanel.tsx`

Impact:

- controls dominate the screen
- editing surface is secondary

### Root Cause D: Image picker uses “show everything” instead of a focused mobile stepper flow

Files:

- `src/index.css:551-680`
- `src/index.css:832-838`

Impact:

- modal becomes too tall
- preview and controls compete vertically

## Fix Order Recommendation

### Phase 1: Stop the biggest mobile breakage

1. Fix canvas scale logic so mobile stage size is not derived from `wrapperBounds.top`
2. Rework mobile section order so canvas appears before or alongside the main actions
3. Collapse or redesign action rail on mobile

Expected outcome:

- the user sees and can use the canvas on first interaction

### Phase 2: Make text editing survivable on mobile

1. Move properties into a lighter mobile pattern:
   - bottom sheet
   - segmented tabs
   - collapsible sections
2. reduce preset card footprint
3. keep only the most relevant controls visible at once

Expected outcome:

- selecting text no longer creates a 2000px settings wall

### Phase 3: Rebuild image picker as a mobile-first flow

1. keep preview dominant
2. move secondary controls below a compact header
3. add sticky apply/cancel area
4. restore bounded modal height and internal scrolling zones

Expected outcome:

- image import becomes a focused mobile task instead of a stretched desktop modal

## Immediate Next Technical Tasks

Recommended first implementation pass:

1. branch mobile layout from desktop more aggressively
2. introduce a dedicated mobile workbench order
3. rewrite canvas scaling logic
4. make action rail horizontal or compact two-column
5. reduce mobile topbar height

## Summary

The mobile failure is real and reproducible.

It is not caused by one isolated CSS bug.

The biggest breakage comes from:

- incorrect stage scaling logic
- wrong mobile content priority
- oversized vertical controls
- an image picker that stops behaving like a modal on phone

This is fixable, but it should be treated as a layout-system correction, not just a spacing cleanup.

## First Fix Pass Status

After this audit, a first mobile correction pass was started in code:

- canvas/editor stage moved ahead of the action rail in the mobile order
- action rail switched from a tall single column to a compact grid
- stage scale was decoupled from the “remaining viewport height below the fold” when the workbench is stacked
- image picker mobile modal was bounded again instead of allowed to grow infinitely

What improved immediately in Playwright screenshots:

- the canvas became the main visual area instead of a tiny preview
- the action rail stopped occupying most of the first screen
- the main empty screen became substantially more usable

What still needs work after that first pass:

- selected-text flow is still too long on phone
- image picker still needs a more focused mobile interaction model
- there is still evidence of touch/hit-area weirdness around the mobile action area during automation
