# Technical Specification

## Decision

We do not need a long separate technical document before development.

Fastest safe path:

1. Keep `PRD.md` as the product source of truth
2. Keep this file as the minimal technical source of truth
3. Start implementation immediately after scaffold

This is enough because the product is still small, the repository is empty, and the MVP scope is clear.

## Recommended Stack

### App

- `React`
- `TypeScript`
- `Vite`

Why:

- fastest path to a working web app
- simple deployment to Vercel or Netlify
- low setup overhead
- good TypeScript support

### Editor Rendering

- `react-konva`
- `konva`

Why:

- natural fit for layered visual editors
- supports drag, transform, rotation, text, images, and export
- easier for precise canvas export than building everything from DOM nodes
- good enough for MVP without inventing our own rendering engine

### State

- `zustand`

Why:

- simple editor state
- no Redux overhead
- easy to model selected layer, canvas format, images, and text blocks

### Utilities

- `nanoid` for layer ids
- browser `FontFace` API for uploaded fonts

### Styling

- plain CSS or CSS modules

Why:

- enough for MVP
- avoids UI library overhead
- keeps full control over layout of the editor

## Architecture

The app should start as a single-page editor with a narrow, practical structure.

### Main areas

- `format picker`
- `canvas/editor area`
- `right-side controls panel`
- `top action bar`

### Top action bar

- choose format: Story or carousel
- upload photo
- add text
- upload font
- export PNG

### Canvas/editor area

- renders the composition
- allows direct selection of layers
- allows drag, resize, crop, and slight rotation
- shows current active object

### Right-side controls panel

Shows controls only for the selected object.

For image:

- position
- scale
- crop
- layer order

For text:

- text content
- font family
- color
- font size
- line height
- alignment
- rotation
- layer order

## Data Model

Use a normalized but simple editor state.

```ts
type CanvasPreset = "story" | "carousel";

type EditorDocument = {
  preset: CanvasPreset;
  width: number;
  height: number;
  backgroundColor: string;
  layers: Layer[];
  selectedLayerId: string | null;
  fonts: UploadedFont[];
};

type UploadedFont = {
  id: string;
  name: string;
  family: string;
  source: string;
};

type Layer = ImageLayer | TextLayer;

type BaseLayer = {
  id: string;
  type: "image" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type ImageLayer = BaseLayer & {
  type: "image";
  src: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type TextLayer = BaseLayer & {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  color: string;
};
```

## Key Technical Choices

### 1. Canvas presets

Hardcode two presets:

- Story: `1080x1920`
- Carousel: `1080x1350`

Render them responsively in the browser while preserving exact export dimensions internally.

### 2. Export

Use Konva stage export with a higher pixel ratio.

Target:

- `PNG`
- high-quality export
- ideally `pixelRatio: 2` or `3`, depending on memory and browser stability

### 3. Uploaded fonts

Use `FontFace` to register uploaded `TTF` files at runtime.

Flow:

1. user uploads `.ttf`
2. app creates object URL
3. app loads font via `new FontFace(...)`
4. app adds font to `document.fonts`
5. font becomes selectable for text layers

### 4. Layer ordering

Store layer order directly in the `layers` array.

- later in array = visually on top
- `bring forward` = move one step toward end
- `send backward` = move one step toward start

### 5. Image crop

For MVP, keep crop implementation pragmatic:

- one selected image at a time
- crop box inside current image bounds
- no pro-level masking

Konva image crop props are enough for first version.

### 6. Transparent sticker-like assets

Treat them exactly like regular image layers if they have transparency.

Support:

- file upload
- clipboard paste for image MIME data if easy to support in the first pass

Clipboard paste is useful, but if it slows down the first build, it should come right after the core editor works.

## Proposed File Structure

```text
src/
  app/
    App.tsx
  editor/
    canvasPresets.ts
    types.ts
    store.ts
    export.ts
    fontLoader.ts
  features/
    canvas/
    images/
    text/
    fonts/
    layers/
    export/
  ui/
    TopBar.tsx
    SidePanel.tsx
    Button.tsx
    Field.tsx
  styles/
    globals.css
```

## MVP Build Order

### Phase 1: project scaffold

- create Vite React TypeScript app
- set up base styles
- create editor shell layout
- add format picker

### Phase 2: canvas foundation

- add Konva stage
- render empty preset canvas
- make responsive stage scaling work

### Phase 3: single image workflow

- upload one image
- render image on canvas
- move and scale image
- implement basic crop flow

### Phase 4: text workflow

- add multiple text layers
- select and edit text
- support color, size, line height, alignment, rotation

### Phase 5: custom fonts

- upload `TTF`
- register font dynamically
- apply font to selected text layer

### Phase 6: layers

- add bring forward / send backward
- support text above image and image above image

### Phase 7: export

- export high-quality PNG

### Phase 8: bonus MVP features

- simple 4-photo collage preset
- transparent asset upload
- clipboard image paste

## What We Should Not Overbuild Yet

- undo/redo history
- autosave
- multi-page documents
- account system
- reusable templates
- smart snapping
- effects panel
- design system polish beyond what is needed to make the editor feel clean

## Development Strategy

Fastest route:

1. build a working ugly editor first
2. verify the real editing loop works
3. only then polish the UI

The critical risk is not visual polish first. The critical risk is whether text, fonts, image transforms, and export feel correct together.

## Definition of "Ready to Test"

We are ready for first user testing when this exact loop works:

1. open app
2. choose Story or carousel
3. upload photo
4. add two text blocks
5. upload custom `TTF`
6. move and resize content
7. export PNG

If this loop feels easy, we are on the right path.
