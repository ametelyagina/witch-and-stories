# Product Requirements Document

## Product

Working title: story text editor

Goal: build a simple web app for Instagram-style visual layouts where a user can quickly place text on top of one or more photos, use their own font, and export a polished PNG without fighting the interface.

Primary audience: the author of this brief and users like her, especially bloggers who make Stories and carousel visuals often and care about typography, speed, and control.

## Problem

Existing tools feel confusing, clumsy, and visually low-quality. They make basic actions harder than they should be:

- adding a photo is not obvious
- editing text placement is frustrating
- resizing and aligning text blocks feels awkward
- typography quality is poor
- simple visual tasks take too long

The first version must feel immediate, obvious, and trustworthy.

## Product Principles

- Simplicity over feature bloat
- Fast first result
- Strong typography control without a complex editor
- No registration before value
- Works on desktop and mobile web
- Development and primary testing can start on desktop, but the product must remain usable on phone

## MVP Scope

The MVP supports creating visuals in two target formats:

1. Story format: `9:16` (`1080x1920`)
2. Feed/carousel format: `4:5` (`1080x1350`)

The MVP allows the user to:

- create a canvas in one of the two supported formats
- add one or more photos
- move, scale, and crop photos
- place one image on top of another
- add multiple text blocks
- upload a custom `TTF` font and apply it to text
- edit text color
- edit text size
- edit line height
- rotate text slightly
- align text
- move text anywhere on the canvas
- control basic layer order with "bring forward" and "send backward"
- export the final result as high-quality `PNG`
- use a very simple 4-image collage layout where four images are placed in a 2x2 grid
- insert transparent sticker-like cutouts as regular transparent image assets, for example `PNG` or `WebP`

## Explicitly Out of Scope for MVP

These are intentionally postponed:

- registration and user accounts
- project saving and cloud sync
- templates beyond the simple 4-image collage
- shadows, outlines, glow, and other text effects
- automatic text placement
- automatic font selection
- AI-generated layouts
- font recognition from an image
- advanced sticker extraction tools
- complex image masks, blend modes, and pro design tooling
- video support

## Core User Flows

### Flow 1: Single-photo Story

1. User opens the site
2. User chooses Story format
3. User uploads a photo
4. User adds one or more text blocks
5. User uploads a custom `TTF` font if needed
6. User adjusts text size, color, line height, alignment, position, and slight rotation
7. User adjusts the photo by moving, scaling, or cropping it
8. User exports the result as a high-quality `PNG`

### Flow 2: Layered Story

1. User opens the site
2. User uploads a base photo
3. User adds another image on top
4. User uses layer ordering to move assets forward or backward
5. User adds text and exports the result

### Flow 3: Simple 4-photo Collage

1. User opens the site
2. User chooses the 4-photo collage option
3. User inserts four images into a 2x2 layout
4. User adjusts crop and positioning inside each area
5. User optionally adds text on top
6. User exports the final image as `PNG`

### Flow 4: Sticker-style Asset

1. User copies or prepares a transparent image asset
2. User pastes or uploads that asset into the editor
3. User scales and positions it above the main photo
4. User exports the composition

## Functional Requirements

### 1. Canvas and Format

- The app must offer exactly two canvas presets in MVP: Story and feed/carousel
- The Story preset must use `9:16`
- The feed/carousel preset must use `4:5`
- The canvas must render predictably on desktop and mobile browsers

### 2. Image Handling

- Users must be able to upload at least one image into the canvas
- Users must be able to add additional images as separate layers
- Each image must support moving
- Each image must support scaling
- Each image must support cropping
- The editor should support transparent images such as `PNG` and `WebP`

### 3. Text Editing

- Users must be able to create multiple text blocks
- Each text block must support:
  - free text input in Russian and English
  - custom font selection from uploaded fonts
  - font size control
  - line height control
  - text color control
  - alignment control
  - positioning on canvas
  - slight rotation

### 4. Font Upload

- The MVP must support uploading custom `TTF` font files
- Uploaded fonts must become available inside the current editing session
- The app must apply the uploaded font directly to text blocks

### 5. Layer Order

- Text and image elements must exist as layers
- The user must be able to move a selected layer forward
- The user must be able to move a selected layer backward

### 6. Export

- The output must be downloadable as `PNG`
- Export quality must prioritize visual sharpness over small file size
- The result should be suitable for sharing to Instagram Stories or carousel posts

## UX Requirements

- The first screen must make it obvious how to start
- Adding the first photo must be straightforward
- The editor must avoid clutter and feature overload
- The most important controls should be visible without hunting through deep menus
- Text manipulation should feel direct and predictable
- The UI should feel good enough that the user trusts the result quickly

## Quality Bar

The MVP is successful if:

- a user can create and export a Story without explanation
- custom fonts work reliably for uploaded `TTF` files
- text placement feels easy, not technical
- the result looks clean enough for a blogger to actually post
- the whole task can be completed in a few minutes

The MVP is not successful if:

- users struggle to understand how to add media or text
- text controls are hidden or awkward
- uploaded fonts fail often
- the export looks soft or broken
- the interface feels heavier than the task itself

## Future Versions

Possible next-step enhancements after MVP:

- text shadows and outlines
- more collage templates
- reusable project saves
- mobile-specific paste flows
- more typography controls
- presets for frequent creator use cases
- better sticker workflows
- smarter snapping and alignment tools

## Build Priority

Recommended implementation order:

1. Canvas presets and export
2. Single image upload with move/scale/crop
3. Multiple text blocks with core text controls
4. Custom `TTF` upload
5. Layer ordering
6. Multiple image layers
7. Simple 4-photo collage
8. Transparent sticker-style asset support
