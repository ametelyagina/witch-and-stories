# Text Features Technical Spec

## Purpose

This document is a working technical map for the next stage of the editor:

- move from basic text blocks to Instagram-style text editing
- split the work into independent high-level features
- keep implementation incremental, so each feature can be shipped separately

The goal is not to clone Instagram exactly.

The goal is to add the highest-value text capabilities in a practical order, without breaking the current editor architecture.

## Current Baseline In This Repo

The current editor already supports a useful text MVP:

- create text layers
- move text on canvas
- resize text block
- rotate text
- change font family
- change font size
- change line height
- change text color
- change alignment
- export final composition as PNG

Current implementation touchpoints:

- text layer creation and transform logic: `src/App.tsx`
- text rendering on the canvas/editor stage: `src/components/EditorCanvas.tsx`
- text controls UI: `src/components/PropertiesPanel.tsx`
- upload/add actions: `src/components/ActionRail.tsx`

This means we do not need a new editor engine.

We need to evolve the existing text layer model, controls panel, and Konva rendering pipeline.

## Product Goal For The Next Phase

The next phase should make text feel closer to Instagram Stories in three dimensions:

1. faster styling
2. richer visual treatments
3. better expressive control

Recommended implementation order:

1. font presets
2. style picker
3. background/highlight behind text
4. outline, shadow, glow, neon-like effects
5. text-only story mode
6. eyedropper / advanced color picking
7. multi-color rich text inside one text block
8. animated text styles

## Shared Architecture Changes

Before implementing the richer features, the text layer model should become more explicit.

Current `TextLayer` is too small for Instagram-like styling.

Recommended direction:

```ts
type TextEffectPreset =
  | "none"
  | "solid"
  | "outline"
  | "shadow"
  | "glow"
  | "neon"
  | "marker";

type TextBackgroundStyle =
  | "none"
  | "pill"
  | "box"
  | "highlight"
  | "underline";

type TextAnimationPreset =
  | "none"
  | "typewriter"
  | "word-reveal"
  | "fade-up"
  | "blink";

type TextStylePreset = {
  id: string;
  label: string;
  fontFamily?: string;
  fontWeight?: number;
  textTransform?: "none" | "uppercase";
  letterSpacing?: number;
  effectPreset?: TextEffectPreset;
  backgroundStyle?: TextBackgroundStyle;
};

type RichTextRun = {
  text: string;
  color: string;
  fontFamily?: string;
  fontWeight?: number;
  effectPreset?: TextEffectPreset;
  backgroundStyle?: TextBackgroundStyle;
};

type TextLayer = BaseLayer & {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  color: string;

  stylePresetId?: string;
  backgroundStyle?: TextBackgroundStyle;
  backgroundColor?: string;
  backgroundOpacity?: number;
  paddingX?: number;
  paddingY?: number;
  borderRadius?: number;

  effectPreset?: TextEffectPreset;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  glowColor?: string;
  glowStrength?: number;

  animationPreset?: TextAnimationPreset;
  animationDurationMs?: number;
  animationDelayMs?: number;

  richTextRuns?: RichTextRun[];
};
```

Important rule:

- keep `text` as the base field
- add richer fields progressively
- do not migrate immediately to full rich text for every simple feature

This lets us ship simpler features first and delay the expensive ones.

## Feature 1: Font Presets

### User Value

The user can choose from a curated set of story-friendly text looks quickly, without manually building each style from sliders.

Examples:

- elegant serif
- clean sans
- narrow uppercase
- handwritten accent
- bold poster style

### What To Build

- a preset strip or preset list in the text controls panel
- each preset writes a bundle of values into the selected text layer
- presets should work both with built-in fonts and uploaded fonts where possible

### Data Model

Add:

- `stylePresetId`

Optional per preset:

- `fontFamily`
- `fontWeight`
- `letterSpacing`
- `textTransform`
- default `fontSize` multiplier

### Rendering

For simple presets, existing `Konva.Text` is enough.

No new render engine is required.

### UI Changes

In `src/components/PropertiesPanel.tsx`:

- add a new section `Style Preset`
- preview each preset with a small label sample
- one click applies the preset to the selected layer

### Complexity

Low to medium.

### Main Risks

- preset names may feel too technical
- uploaded fonts will not always match the intended preset mood

### Suggested Delivery

Ship with 5 to 8 presets, not dozens.

## Feature 2: Style Picker

### User Value

This is the closest UX step toward Instagram Stories.

The user should be able to tap through visual text treatments fast instead of manually combining settings.

### What To Build

A style picker where each style combines:

- font choice
- text effect
- optional background treatment
- spacing / case rules

Examples:

- clean
- headline
- highlighted
- outlined
- glowing
- marker

### Data Model

Reuse:

- `stylePresetId`
- `effectPreset`
- `backgroundStyle`

Do not create a separate layer type for this.

It should stay a text layer with a richer style definition.

### Rendering

Two levels:

1. simple preset: render by changing normal text props
2. decorated preset: render one or more helper shapes behind or around the text

Possible implementation:

- keep a small renderer function that converts a text layer into a `render plan`
- render plan decides whether we need:
  - only `Konva.Text`
  - `Konva.Rect + Konva.Text`
  - multiple text passes for outline/glow

### UI Changes

- style thumbnails with visual previews
- selecting a style must be instant
- manual controls stay available after preset selection

### Complexity

Medium.

### Main Risks

- presets may become inconsistent if manual edits override too many fields

### Suggested Delivery

Support override behavior explicitly:

- selecting preset writes initial values
- later manual edits are allowed
- preset is treated as a starting point, not a lock

## Feature 3: Background / Highlight Behind Text

### User Value

This covers the most obvious Instagram-like need:

- white text on dark chip
- black text on white chip
- highlighted phrase
- marker-like stripe behind the text

### What To Build

Support these modes first:

- `none`
- `pill`
- `box`
- `highlight`

### Data Model

Add:

- `backgroundStyle`
- `backgroundColor`
- `backgroundOpacity`
- `paddingX`
- `paddingY`
- `borderRadius`

### Rendering

Render order:

1. measure text box
2. draw background shape behind text
3. draw text on top

Implementation options:

- `Konva.Rect` for `pill` and `box`
- custom shape or slightly offset rect for `highlight`

For multiline text:

- phase 1: single block background around the whole text box
- phase 2: per-line highlight shapes

Phase 1 is much cheaper and should come first.

### UI Changes

- toggle for `background on/off`
- style selector
- background color control
- opacity control
- padding control

### Complexity

Medium.

### Main Risks

- per-line highlighting is harder than a single box
- multiline layout can look cheap if padding is wrong

### Suggested Delivery

Start with:

- one background box for the whole text block
- no per-word highlight

## Feature 4: Outline, Shadow, Glow, Neon-Like Effects

### User Value

This is where the text starts feeling more expressive and more “story-ready”.

### What To Build

Support these effects:

- `outline`
- `shadow`
- `glow`
- `neon`

### Data Model

Add:

- `effectPreset`
- `strokeColor`
- `strokeWidth`
- `shadowColor`
- `shadowBlur`
- `shadowOffsetX`
- `shadowOffsetY`
- `glowColor`
- `glowStrength`

### Rendering

Implementation by effect:

- `outline`: `stroke` + `strokeWidth` on text
- `shadow`: shadow props on text
- `glow`: duplicate text passes or shadow-based glow
- `neon`: bright fill + strong glow + maybe thin stroke

Recommended architecture:

- central `renderTextLayer(layer)` helper
- helper expands one logical text layer into one or more Konva nodes

### Export Implications

Effects increase rendering cost and can change PNG sharpness.

Need to test:

- large text
- multiple text layers
- high `pixelRatio`

### Complexity

Medium for outline and shadow.

Medium to high for glow and neon polish.

### Main Risks

- blurry exports
- inconsistent look across fonts
- performance issues with multiple layered glow passes

### Suggested Delivery

Ship in this order:

1. outline
2. shadow
3. glow
4. neon preset

## Feature 5: Text-Only Story Mode

### User Value

This covers the “just open and type” story workflow:

- no photo required
- gradient or solid background
- strong text in the center

### What To Build

- story creation mode without image upload
- canvas background presets
- centered starter text
- optional background texture or gradient

### Data Model

At document level:

- `backgroundFillType`
- `backgroundColor`
- `backgroundGradient`
- `backgroundTextureId`

This belongs to the document/canvas, not to the text layer.

### Rendering

The stage should render:

1. canvas background
2. image layers if any
3. text layers

### UI Changes

Possible entry points:

- extra action button: `Text story`
- or empty-state choice between `Photo story` and `Text story`

### Complexity

Low to medium.

### Main Risks

- visual result will feel generic if background presets are weak

### Suggested Delivery

Ship with:

- 6 to 10 background presets
- centered default text
- normal text editing still works after creation

## Feature 6: Eyedropper / Advanced Color Picking

### User Value

The user can pick text color from the image directly instead of guessing the right hex.

### What To Build

- color picker UI beyond native `<input type="color">`
- eyedropper for supported browsers
- fallback palette for unsupported browsers
- recent colors

### Data Model

No major structural changes required.

Optional:

- `recentColors` in app state or local persistence

### Rendering

No renderer change.

This is mostly a UI and browser API task.

### Browser APIs

If available, use:

- `EyeDropper`

Fallback:

- keep native color input
- save recent swatches manually

### UI Changes

- color swatch row
- eyedropper button
- recent colors history

### Complexity

Low to medium.

### Main Risks

- `EyeDropper` is not universal
- need graceful fallback

### Suggested Delivery

Do not block the feature on full browser support.

Ship as:

- progressive enhancement

## Feature 7: Multi-Color Rich Text Inside One Text Block

### User Value

This enables the user to make one word white, another black, one phrase highlighted, and so on inside the same text block.

This is the biggest leap toward real Instagram-like text editing.

### What To Build

Support per-range styling inside one logical text block.

Minimum target:

- select part of text
- assign a different color

Later extensions:

- per-range font weight
- per-range effect
- per-range highlight

### Data Model

This is where a plain string stops being enough.

Add:

- `richTextRuns`

Example:

```ts
[
  { text: "hello ", color: "#ffffff" },
  { text: "world", color: "#000000" }
]
```

### Rendering

This cannot stay a single `Konva.Text` node if styles differ inside the same line.

Possible implementation strategies:

1. custom text layout engine that splits runs into positioned fragments
2. render to hidden DOM or canvas and import as image
3. hybrid approach with internal line measurement and fragment rendering

Recommended approach for this project:

- custom fragment layout on canvas

Why:

- export stays predictable
- transforms stay inside the existing stage
- later animated text is easier to layer on top

### UI Changes

This likely requires a different editing surface than the current simple textarea.

Possible path:

- keep textarea for raw text editing
- add a lightweight inline “selected range style” panel
- maintain styled runs separately

### Complexity

High.

### Main Risks

- line wrapping with mixed styles
- cursor/selection mapping
- keeping textarea editing and rendered result in sync
- Russian + English + emoji + punctuation behavior

### Suggested Delivery

Do not start with full rich text.

Start with:

- colorized runs only
- no animated runs
- no mixed per-run geometry

## Feature 8: Animated Text Styles

### User Value

This is the strongest visual parity move toward modern Instagram Stories.

### What To Build

Support a few animation presets:

- `typewriter`
- `word-reveal`
- `fade-up`
- `blink`

### Scope Clarification

There are two possible interpretations:

1. editor preview only
2. exported animated output

Recommended first step:

- editor preview only

Current export is PNG, so animation cannot be exported in the current product format.

### Data Model

Add:

- `animationPreset`
- `animationDurationMs`
- `animationDelayMs`

### Rendering

Options:

1. React/Konva time-based animation on the stage
2. generate per-frame visible text fragments

Recommended first step:

- time-based preview-only animation

### UI Changes

- animation selector
- preview play / replay button
- duration slider

### Complexity

High.

### Main Risks

- mismatch between static export and animated preview
- text measurement issues
- difficult edge cases with emojis, ligatures, and mixed-direction text

### Suggested Delivery

This should come only after:

- presets
- background styles
- visual effects
- richer text model

## Cross-Cutting Quality Requirements

Each text feature should be tested against:

- Russian text
- English text
- mixed Russian + English
- emoji
- multiline blocks
- very small and very large text
- light backgrounds
- dark backgrounds
- export quality at final PNG resolution

## Recommended Delivery Strategy

### Phase 1: Fast Wins

- font presets
- style picker
- background/highlight behind text
- outline and shadow
- text-only story mode
- eyedropper

These features provide the best ratio of user value to implementation effort.

### Phase 2: Higher Complexity

- glow and neon polish
- better style thumbnails
- smarter preset system

### Phase 3: Expensive Features

- multi-color rich text
- animated text styles

These should be treated as mini-subsystems, not as “small UI improvements”.

## Proposed File Touchpoints

Likely files that will change during implementation:

- `src/editor/types.ts`
- `src/App.tsx`
- `src/components/EditorCanvas.tsx`
- `src/components/PropertiesPanel.tsx`
- `src/index.css`

Likely new files to add:

- `src/editor/textPresets.ts`
- `src/editor/textEffects.ts`
- `src/editor/textLayout.ts`
- `src/editor/textRenderer.tsx`
- `src/components/TextStylePicker.tsx`
- `src/components/TextEffectControls.tsx`
- `src/components/ColorSwatches.tsx`

## Decision Summary

What is cheap and should be done first:

- presets
- style picker
- background chips / highlights
- outline / shadow
- text-only story mode
- eyedropper

What is valuable but materially harder:

- multi-color text inside one block
- animated text styles

Important implementation rule:

- do not jump to a full rich-text engine before shipping the simpler, high-value text treatments

That path is slower, riskier, and unnecessary for the next milestone.
