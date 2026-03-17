import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { startPreviewServer } from './helpers/preview-server.mjs';

const STORAGE_KEY = 'story-text-editor-state-v1';
const STORAGE_DB_NAME = 'story-text-editor-storage';
const STORAGE_OBJECT_STORE = 'state';
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
};

let browser;
let previewServer;

before(async () => {
  previewServer = await startPreviewServer({
    cwd: ROOT_DIR,
  });
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await previewServer?.stop();
});

function buildState({
  preset = 'story',
  selectedLayerId = null,
  textStylePresets = [],
  layers = [],
} = {}) {
  return {
    preset,
    selectedLayerId,
    fonts: [
      {
        id: 'default',
        name: 'System Sans',
        family: 'Arial',
      },
    ],
    textStylePresets,
    layers,
  };
}

function buildTextLayer(overrides = {}) {
  return {
    id: 'text-1',
    type: 'text',
    text: 'Привет',
    fontFamily: 'Arial',
    fontStyle: 'bold',
    letterSpacing: 0,
    fontSize: 84,
    lineHeight: 1.2,
    align: 'left',
    color: '#241d17',
    backgroundEnabled: false,
    backgroundColor: '#fff3e8',
    backgroundStyle: 'soft',
    x: 120,
    y: 320,
    width: 720,
    height: 220,
    rotation: 0,
    ...overrides,
  };
}

function buildImageLayer(overrides = {}) {
  return {
    id: 'image-1',
    type: 'image',
    kind: 'overlay',
    src:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">' +
          '<circle cx="160" cy="160" r="140" fill="#ff7e50"/>' +
        '</svg>',
      ),
    naturalWidth: 320,
    naturalHeight: 320,
    x: 220,
    y: 360,
    width: 220,
    height: 220,
    rotation: 0,
    crop: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },
    ...overrides,
  };
}

async function openMobilePage({
  state = buildState(),
  extraInitScripts = [],
  seedStorage = true,
} = {}) {
  const context = await browser.newContext({
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  if (seedStorage) {
    await context.addInitScript(
      ({ storageKey, nextState }) => {
        localStorage.clear();
        if (nextState) {
          localStorage.setItem(storageKey, JSON.stringify(nextState));
        }
      },
      {
        storageKey: STORAGE_KEY,
        nextState: state,
      },
    );
  }

  for (const script of extraInitScripts) {
    await context.addInitScript(script.fn, script.arg);
  }

  const page = await context.newPage();
  await page.goto(previewServer.url, { waitUntil: 'networkidle' });

  return { context, page };
}

async function readSavedState(page) {
  return page.evaluate(
    async ({ storageKey, storageDbName, storageObjectStore }) => {
      const readLocalEnvelope = () => {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      };

      const readIndexedDbEnvelope = async () => {
        if (typeof indexedDB === 'undefined') {
          return null;
        }

        return new Promise((resolve) => {
          try {
            const request = indexedDB.open(storageDbName);

            request.onsuccess = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains(storageObjectStore)) {
                database.close();
                resolve(null);
                return;
              }

              try {
                const transaction = database.transaction(storageObjectStore, 'readonly');
                const store = transaction.objectStore(storageObjectStore);
                const getRequest = store.get(storageKey);

                getRequest.onsuccess = () => resolve(getRequest.result ?? null);
                getRequest.onerror = () => resolve(null);
                transaction.oncomplete = () => database.close();
                transaction.onerror = () => database.close();
                transaction.onabort = () => database.close();
              } catch {
                database.close();
                resolve(null);
              }
            };

            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      };

      const localEnvelope = readLocalEnvelope();
      const indexedDbEnvelope = await readIndexedDbEnvelope();
      const localSavedAt = typeof localEnvelope?.savedAt === 'number' ? localEnvelope.savedAt : 0;
      const indexedDbSavedAt =
        typeof indexedDbEnvelope?.savedAt === 'number' ? indexedDbEnvelope.savedAt : 0;

      return localSavedAt >= indexedDbSavedAt ? localEnvelope : indexedDbEnvelope;
    },
    {
      storageKey: STORAGE_KEY,
      storageDbName: STORAGE_DB_NAME,
      storageObjectStore: STORAGE_OBJECT_STORE,
    },
  );
}

async function waitForSavedLayerCount(page, expectedCount) {
  await page.waitForFunction(
    async ({ storageKey, storageDbName, storageObjectStore, nextCount }) => {
      const readLocalEnvelope = () => {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      };

      const readIndexedDbEnvelope = async () => {
        if (typeof indexedDB === 'undefined') {
          return null;
        }

        return new Promise((resolve) => {
          try {
            const request = indexedDB.open(storageDbName);

            request.onsuccess = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains(storageObjectStore)) {
                database.close();
                resolve(null);
                return;
              }

              try {
                const transaction = database.transaction(storageObjectStore, 'readonly');
                const store = transaction.objectStore(storageObjectStore);
                const getRequest = store.get(storageKey);

                getRequest.onsuccess = () => resolve(getRequest.result ?? null);
                getRequest.onerror = () => resolve(null);
                transaction.oncomplete = () => database.close();
                transaction.onerror = () => database.close();
                transaction.onabort = () => database.close();
              } catch {
                database.close();
                resolve(null);
              }
            };

            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      };

      const localEnvelope = readLocalEnvelope();
      const indexedDbEnvelope = await readIndexedDbEnvelope();
      const localSavedAt = typeof localEnvelope?.savedAt === 'number' ? localEnvelope.savedAt : 0;
      const indexedDbSavedAt =
        typeof indexedDbEnvelope?.savedAt === 'number' ? indexedDbEnvelope.savedAt : 0;
      const latestEnvelope =
        localSavedAt >= indexedDbSavedAt ? localEnvelope : indexedDbEnvelope;

      return latestEnvelope?.layers?.length === nextCount;
    },
    {
      storageKey: STORAGE_KEY,
      storageDbName: STORAGE_DB_NAME,
      storageObjectStore: STORAGE_OBJECT_STORE,
      nextCount: expectedCount,
    },
  );
}

async function readCanvasStageFrameWidth(page) {
  return page.locator('.canvas-stage-frame').evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).width),
  );
}

async function readCanvasStageInnerBounds(page) {
  return page.locator('.canvas-stage-inner').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function dispatchPinchGesture(
  page,
  {
    selector = '.canvas-stage-frame',
    startDistance = 84,
    endDistance = 184,
    steps = 6,
    centerXFactor = 0.5,
    centerYFactor = 0.5,
  } = {},
) {
  await page.evaluate(
    async ({
      selector,
      startDistance,
      endDistance,
      steps,
      centerXFactor,
      centerYFactor,
    }) => {
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) {
        throw new Error(`Missing pinch target: ${selector}`);
      }

      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width * centerXFactor;
      const centerY = rect.top + rect.height * centerYFactor;

      const getPoints = (distance) => [
        { x: centerX - distance / 2, y: centerY },
        { x: centerX + distance / 2, y: centerY },
      ];

      const dispatchPointer = (type, pointerId, point, buttons) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType: 'touch',
            isPrimary: pointerId === 1,
            button: 0,
            buttons,
            pressure: type === 'pointerup' ? 0 : 0.5,
            width: 28,
            height: 28,
            clientX: point.x,
            clientY: point.y,
          }),
        );
      };

      const [firstStart, secondStart] = getPoints(startDistance);
      dispatchPointer('pointerdown', 1, firstStart, 1);
      dispatchPointer('pointerdown', 2, secondStart, 1);

      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        const nextDistance = startDistance + (endDistance - startDistance) * progress;
        const [firstPoint, secondPoint] = getPoints(nextDistance);
        dispatchPointer('pointermove', 1, firstPoint, 1);
        dispatchPointer('pointermove', 2, secondPoint, 1);
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      }

      const [firstEnd, secondEnd] = getPoints(endDistance);
      dispatchPointer('pointerup', 1, firstEnd, 0);
      dispatchPointer('pointerup', 2, secondEnd, 0);
    },
    {
      selector,
      startDistance,
      endDistance,
      steps,
      centerXFactor,
      centerYFactor,
    },
  );

  await page.waitForTimeout(120);
}

async function dispatchSingleTouchDrag(
  page,
  { startX, startY, endX, endY, steps = 8 } = {},
) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: startX,
        y: startY,
        radiusX: 16,
        radiusY: 16,
        force: 1,
        id: 1,
      },
    ],
  });

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: startX + (endX - startX) * progress,
          y: startY + (endY - startY) * progress,
          radiusX: 16,
          radiusY: 16,
          force: 1,
          id: 1,
        },
      ],
    });
    await page.waitForTimeout(16);
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
  await page.waitForTimeout(160);
}

async function dispatchDragThenPinchGesture(
  page,
  {
    startX,
    startY,
    dragOffsetX = 24,
    dragOffsetY = 28,
    secondFingerOffsetX = 96,
    secondFingerOffsetY = 0,
    pinchSpreadStep = 18,
    pinchSteps = 5,
  } = {},
) {
  const client = await page.context().newCDPSession(page);
  const draggedX = startX + dragOffsetX;
  const draggedY = startY + dragOffsetY;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: startX,
        y: startY,
        radiusX: 16,
        radiusY: 16,
        force: 1,
        id: 1,
      },
    ],
  });
  await page.waitForTimeout(40);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      {
        x: draggedX,
        y: draggedY,
        radiusX: 16,
        radiusY: 16,
        force: 1,
        id: 1,
      },
    ],
  });
  await page.waitForTimeout(40);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: draggedX,
        y: draggedY,
        radiusX: 16,
        radiusY: 16,
        force: 1,
        id: 1,
      },
      {
        x: draggedX + secondFingerOffsetX,
        y: draggedY + secondFingerOffsetY,
        radiusX: 16,
        radiusY: 16,
        force: 1,
        id: 2,
      },
    ],
  });

  for (let step = 1; step <= pinchSteps; step += 1) {
    const spread = pinchSpreadStep * step;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: draggedX - spread,
          y: draggedY,
          radiusX: 16,
          radiusY: 16,
          force: 1,
          id: 1,
        },
        {
          x: draggedX + secondFingerOffsetX + spread,
          y: draggedY + secondFingerOffsetY,
          radiusX: 16,
          radiusY: 16,
          force: 1,
          id: 2,
        },
      ],
    });
    await page.waitForTimeout(16);
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
  await page.waitForTimeout(200);
}

async function waitForSavedFontCount(page, expectedCount) {
  await page.waitForFunction(
    async ({ storageKey, storageDbName, storageObjectStore, nextCount }) => {
      const readLocalEnvelope = () => {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      };

      const readIndexedDbEnvelope = async () => {
        if (typeof indexedDB === 'undefined') {
          return null;
        }

        return new Promise((resolve) => {
          try {
            const request = indexedDB.open(storageDbName);

            request.onsuccess = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains(storageObjectStore)) {
                database.close();
                resolve(null);
                return;
              }

              try {
                const transaction = database.transaction(storageObjectStore, 'readonly');
                const store = transaction.objectStore(storageObjectStore);
                const getRequest = store.get(storageKey);

                getRequest.onsuccess = () => resolve(getRequest.result ?? null);
                getRequest.onerror = () => resolve(null);
                transaction.oncomplete = () => database.close();
                transaction.onerror = () => database.close();
                transaction.onabort = () => database.close();
              } catch {
                database.close();
                resolve(null);
              }
            };

            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      };

      const localEnvelope = readLocalEnvelope();
      const indexedDbEnvelope = await readIndexedDbEnvelope();
      const localSavedAt = typeof localEnvelope?.savedAt === 'number' ? localEnvelope.savedAt : 0;
      const indexedDbSavedAt =
        typeof indexedDbEnvelope?.savedAt === 'number' ? indexedDbEnvelope.savedAt : 0;
      const latestEnvelope =
        localSavedAt >= indexedDbSavedAt ? localEnvelope : indexedDbEnvelope;

      return latestEnvelope?.fonts?.length === nextCount;
    },
    {
      storageKey: STORAGE_KEY,
      storageDbName: STORAGE_DB_NAME,
      storageObjectStore: STORAGE_OBJECT_STORE,
      nextCount: expectedCount,
    },
  );
}

async function sampleCanvasPixel(page, sample) {
  return page.evaluate(({ lineText, pointX, pointY, artboardWidth, artboardHeight }) => {
    const canvas = document.querySelector('.konvajs-content canvas');
    const stageInner = document.querySelector('.canvas-stage-inner');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return null;
    }

    const context = canvas.getContext('2d');
    const measureContext = document.createElement('canvas').getContext('2d');
    if (!context || !measureContext) {
      return null;
    }

    measureContext.font = 'normal 700 84px Arial';
    const lineWidth = measureContext.measureText(lineText).width;
    const stageWidth =
      stageInner instanceof HTMLElement
        ? Number.parseFloat(getComputedStyle(stageInner).width)
        : artboardWidth;
    const stageHeight =
      stageInner instanceof HTMLElement
        ? Number.parseFloat(getComputedStyle(stageInner).height)
        : artboardHeight;
    const offsetX = (stageWidth - artboardWidth) / 2;
    const offsetY = (stageHeight - artboardHeight) / 2;
    const ratio = canvas.width / stageWidth;
    const sampleX = Math.round((offsetX + pointX + lineWidth + 12) * ratio);
    const sampleY = Math.round((offsetY + pointY) * ratio);

    return {
      sampleX,
      sampleY,
      pixel: Array.from(context.getImageData(sampleX, sampleY, 1, 1).data),
    };
  }, {
    artboardWidth: sample.artboardWidth ?? 1080,
    artboardHeight: sample.artboardHeight ?? 1920,
    lineText: sample.lineText,
    pointX: sample.pointX,
    pointY: sample.pointY,
  });
}

async function sampleStagePixel(page, sample) {
  return page.evaluate(({ stageX, stageY }) => {
    const canvas = document.querySelector('.konvajs-content canvas');
    const stageInner = document.querySelector('.canvas-stage-inner');
    if (!(canvas instanceof HTMLCanvasElement) || !(stageInner instanceof HTMLElement)) {
      return null;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    const stageWidth = Number.parseFloat(getComputedStyle(stageInner).width);
    const ratio = canvas.width / stageWidth;
    const sampleX = Math.round(stageX * ratio);
    const sampleY = Math.round(stageY * ratio);

    return {
      sampleX,
      sampleY,
      pixel: Array.from(context.getImageData(sampleX, sampleY, 1, 1).data),
    };
  }, sample);
}

async function readArtboardProjection(page, { artboardWidth = 1080, artboardHeight = 1920 } = {}) {
  return page.evaluate(({ artboardWidth, artboardHeight }) => {
    const frame = document.querySelector('.canvas-stage-frame');
    const stageInner = document.querySelector('.canvas-stage-inner');
    if (!(frame instanceof HTMLElement) || !(stageInner instanceof HTMLElement)) {
      return null;
    }

    const frameBounds = frame.getBoundingClientRect();
    const stageWidth = Number.parseFloat(getComputedStyle(stageInner).width);
    const stageHeight = Number.parseFloat(getComputedStyle(stageInner).height);
    const scale = frameBounds.width / stageWidth;

    return {
      frameX: frameBounds.x,
      frameY: frameBounds.y,
      frameWidth: frameBounds.width,
      frameHeight: frameBounds.height,
      scale,
      offsetX: (stageWidth - artboardWidth) / 2,
      offsetY: (stageHeight - artboardHeight) / 2,
    };
  }, {
    artboardWidth,
    artboardHeight,
  });
}

test('mobile expand turns canvas into near-fullscreen stage', async (t) => {
  const { context, page } = await openMobilePage();
  t.after(async () => context.close());

  await page.getByRole('button', { name: /развернуть/i }).click();

  const metrics = await page.evaluate(() => {
    const column = document.querySelector('.canvas-column--expanded');
    const frame = document.querySelector('.canvas-stage-frame');
    const hint = document.querySelector('.hint');
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
      };
    };

    return {
      isExpanded: Boolean(column),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      frame: rect(frame),
      hasHint: Boolean(hint),
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  assert.equal(metrics.isExpanded, true);
  assert(Math.abs(metrics.frame.width - metrics.viewportWidth) <= 1.5);
  assert(metrics.frame.left >= -1);
  assert(metrics.frame.right <= metrics.viewportWidth + 1);
  assert(metrics.frame.height <= metrics.viewportHeight);
  assert.equal(metrics.hasHint, false);
  assert(metrics.scrollHeight <= MOBILE_VIEWPORT.height);
});

test('compact canvas keeps overflow workspace visible around smaller preset', async (t) => {
  const overflowTextLayer = buildTextLayer({
    id: 'text-overflow',
    text: 'Верни с полей',
    y: 1260,
    height: 240,
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      preset: 'carousel',
      selectedLayerId: overflowTextLayer.id,
      layers: [overflowTextLayer],
    }),
  });
  t.after(async () => context.close());

  const metrics = await page.evaluate(() => {
    const stageInner = document.querySelector('.canvas-stage-inner');
    const frame = document.querySelector('.canvas-stage-frame');
    const toolbar = document.querySelector('.text-selection-toolbar');
    const readRect = (element) => {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };

    return {
      stageInnerWidth:
        stageInner instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(stageInner).width)
          : 0,
      stageInnerHeight:
        stageInner instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(stageInner).height)
          : 0,
      frame: readRect(frame),
      toolbar: readRect(toolbar),
    };
  });

  assert(metrics.stageInnerWidth > 1400);
  assert(metrics.stageInnerHeight >= 1350);
  assert(metrics.frame);
  assert(metrics.toolbar);
  assert(metrics.toolbar.bottom <= metrics.frame.bottom + 1);
});

test('compact workspace clips background to artboard while keeping fields outside empty', async (t) => {
  const backgroundLayer = buildImageLayer({
    id: 'background-clip',
    kind: 'background',
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    naturalWidth: 1080,
    naturalHeight: 1920,
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      preset: 'carousel',
      layers: [backgroundLayer],
    }),
  });
  t.after(async () => context.close());

  const metrics = await page.evaluate(() => {
    const stageInner = document.querySelector('.canvas-stage-inner');
    if (!(stageInner instanceof HTMLElement)) {
      return null;
    }

    const stageWidth = Number.parseFloat(getComputedStyle(stageInner).width);
    const stageHeight = Number.parseFloat(getComputedStyle(stageInner).height);
    const artboardWidth = 1080;
    const artboardHeight = 1350;
    const offsetX = (stageWidth - artboardWidth) / 2;
    const offsetY = (stageHeight - artboardHeight) / 2;

    return {
      stageHeight,
      stageX: offsetX + 140,
      stageY: offsetY + artboardHeight + 28,
    };
  });

  assert(metrics);
  assert(metrics.stageHeight < 1700);

  const outsidePixel = await sampleStagePixel(page, {
    stageX: metrics.stageX,
    stageY: metrics.stageY,
  });
  assert(outsidePixel);
  assert.notDeepEqual(outsidePixel.pixel, [255, 126, 80, 255]);
});

test('pinch out on compact canvas expands mobile stage', async (t) => {
  const backgroundLayer = buildImageLayer({
    id: 'background-1',
    kind: 'background',
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    naturalWidth: 1080,
    naturalHeight: 1920,
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      layers: [backgroundLayer],
    }),
  });
  t.after(async () => context.close());

  await dispatchPinchGesture(page, {
    startDistance: 78,
    endDistance: 194,
  });

  await page.locator('.canvas-column--expanded').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /свернуть/i }).waitFor({ state: 'visible' });
});

test('pinch out does not move selected overlay layer on mobile', async (t) => {
  const imageLayer = buildImageLayer();
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: imageLayer.id,
      layers: [imageLayer],
    }),
  });
  t.after(async () => context.close());

  await dispatchPinchGesture(page, {
    startDistance: 82,
    endDistance: 204,
  });

  await page.locator('.canvas-column--expanded').waitFor({ state: 'visible' });
  const savedState = await readSavedState(page);
  const movedLayer = savedState.layers.find((layer) => layer.id === imageLayer.id);

  assert(movedLayer);
  assert.equal(movedLayer.x, imageLayer.x);
  assert.equal(movedLayer.y, imageLayer.y);
});

test('pinch gestures zoom and collapse fullscreen canvas on mobile', async (t) => {
  const backgroundLayer = buildImageLayer({
    id: 'background-2',
    kind: 'background',
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    naturalWidth: 1080,
    naturalHeight: 1920,
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      layers: [backgroundLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /развернуть/i }).click();
  await page.locator('.canvas-column--expanded').waitFor({ state: 'visible' });

  const initialFrameWidth = await readCanvasStageFrameWidth(page);
  const initialInnerBounds = await readCanvasStageInnerBounds(page);
  assert(initialFrameWidth > 300);
  assert(initialInnerBounds.width > 300);

  await dispatchPinchGesture(page, {
    startDistance: 92,
    endDistance: 228,
  });

  await page.waitForFunction((previousInnerWidth) => {
    const inner = document.querySelector('.canvas-stage-inner');
    if (!(inner instanceof HTMLElement)) {
      return false;
    }

    return inner.getBoundingClientRect().width > previousInnerWidth + 80;
  }, initialInnerBounds.width);

  const zoomedFrameWidth = await readCanvasStageFrameWidth(page);
  const zoomedInnerBounds = await readCanvasStageInnerBounds(page);
  assert(Math.abs(zoomedFrameWidth - initialFrameWidth) < 1.5);
  assert(zoomedInnerBounds.width > initialInnerBounds.width + 80);

  await dispatchPinchGesture(page, {
    startDistance: 228,
    endDistance: 68,
  });

  await page.locator('.canvas-column--compact').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /развернуть/i }).waitFor({ state: 'visible' });
});

test('second finger entering during fullscreen drag freezes layer and keeps only zoom', async (t) => {
  const textLayer = buildTextLayer();
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /развернуть/i }).click();
  await page.locator('.canvas-column--expanded').waitFor({ state: 'visible' });

  const beforeFrameWidth = await readCanvasStageFrameWidth(page);
  const beforeInnerBounds = await readCanvasStageInnerBounds(page);
  const projection = await readArtboardProjection(page);
  assert(projection);

  const startX =
    projection.frameX +
    (projection.offsetX + textLayer.x + textLayer.width / 2) * projection.scale;
  const startY =
    projection.frameY +
    (projection.offsetY + textLayer.y + textLayer.height / 2) * projection.scale;

  await dispatchDragThenPinchGesture(page, {
    startX,
    startY,
  });

  const savedState = await readSavedState(page);
  const frozenLayer = savedState.layers.find((layer) => layer.id === textLayer.id);
  assert(frozenLayer);
  assert.equal(frozenLayer.x, textLayer.x);
  assert.equal(frozenLayer.y, textLayer.y);

  const afterFrameWidth = await readCanvasStageFrameWidth(page);
  const afterInnerBounds = await readCanvasStageInnerBounds(page);
  assert(Math.abs(afterFrameWidth - beforeFrameWidth) < 1.5);
  assert(afterInnerBounds.width > beforeInnerBounds.width + 80);
});

test('tap on empty canvas background clears selection and closes text tools', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Сними выделение',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /быстрые настройки текста/i }).click();

  const clickPosition = await page.evaluate(() => {
    const shell = document.querySelector('.canvas-shell');
    const frame = document.querySelector('.canvas-stage-frame');
    if (!(shell instanceof HTMLElement) || !(frame instanceof HTMLElement)) {
      return null;
    }

    const shellRect = shell.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const leftGap = frameRect.left - shellRect.left;
    const rightGap = shellRect.right - frameRect.right;

    return {
      x:
        leftGap > rightGap
          ? Math.max(8, leftGap / 2)
          : Math.min(shellRect.width - 8, frameRect.right - shellRect.left + rightGap / 2),
      y: Math.min(shellRect.height - 8, Math.max(12, frameRect.top - shellRect.top + 18)),
    };
  });

  assert.ok(clickPosition);

  await page.locator('.canvas-shell').click({
    position: clickPosition,
  });

  await page.waitForFunction((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return state.selectedLayerId === null;
  }, STORAGE_KEY);

  await page.locator('.text-selection-popover').waitFor({ state: 'hidden' });
  const savedState = await readSavedState(page);
  assert.equal(savedState.selectedLayerId, null);
});

test('tap on fullscreen black bars clears selection and closes text tools', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Сними выделение fullscreen',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /развернуть/i }).click();
  await page.getByRole('button', { name: /быстрые настройки текста/i }).click();

  const clickPosition = await page.evaluate(() => {
    const shell = document.querySelector('.canvas-shell');
    const frame = document.querySelector('.canvas-stage-frame');
    if (!(shell instanceof HTMLElement) || !(frame instanceof HTMLElement)) {
      return null;
    }

    const shellRect = shell.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const topGap = frameRect.top - shellRect.top;
    const bottomGap = shellRect.bottom - frameRect.bottom;

    if (topGap < 8 && bottomGap < 8) {
      return null;
    }

    return {
      x: shellRect.width / 2,
      y:
        topGap >= bottomGap
          ? Math.max(8, topGap / 2)
          : Math.min(shellRect.height - 8, frameRect.bottom - shellRect.top + bottomGap / 2),
    };
  });

  assert.ok(clickPosition);

  await page.locator('.canvas-shell').click({
    position: clickPosition,
  });

  await page.waitForFunction((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return state.selectedLayerId === null;
  }, STORAGE_KEY);

  await page.locator('.text-selection-popover').waitFor({ state: 'hidden' });
  const savedState = await readSavedState(page);
  assert.equal(savedState.selectedLayerId, null);
});

test('text selection toolbar stays attached to frame while dragging', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Тяни меня',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  const projection = await readArtboardProjection(page);
  const toolbar = page.locator('.text-selection-toolbar');
  const toolbarBefore = await toolbar.boundingBox();
  assert(projection);
  assert(toolbarBefore);

  const startX =
    projection.frameX +
    (projection.offsetX + textLayer.x + textLayer.width / 2) * projection.scale;
  const startY =
    projection.frameY +
    (projection.offsetY + textLayer.y + textLayer.height / 2) * projection.scale;

  await dispatchSingleTouchDrag(page, {
    startX,
    startY,
    endX: startX + 36,
    endY: startY + 52,
  });

  const toolbarDuring = await toolbar.boundingBox();
  assert(toolbarDuring);
  assert(toolbarDuring.x > toolbarBefore.x + 12);
  assert(toolbarDuring.y > toolbarBefore.y + 12);
});

test('fullscreen text editing opens inline editor and focuses textarea', async (t) => {
  const textLayer = buildTextLayer();
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /развернуть/i }).click();
  await page.getByRole('button', { name: /быстрые настройки текста/i }).click();
  await page.getByRole('button', { name: /изменить текст/i }).click();

  const editor = page.locator('.text-inline-editor-input');
  await editor.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');

  const focusState = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName ?? null,
    activeClass:
      document.activeElement instanceof HTMLElement ? document.activeElement.className : null,
  }));

  assert.equal(focusState.activeTag, 'TEXTAREA');
  assert.equal(focusState.activeClass, 'text-inline-editor-input');

  await editor.fill('Новый текст');
  const savedState = await readSavedState(page);
  assert.equal(savedState.layers[0].text, 'Новый текст');
});

test('text highlight toggle persists and paints canvas', async (t) => {
  const textLayer = buildTextLayer({
    text: 'HELLO',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  const sampleBefore = await sampleCanvasPixel(page, {
    lineText: 'HELLO',
    pointX: 120,
    pointY: 364,
  });

  await page.getByRole('button', { name: /быстрые настройки текста/i }).click();
  await page.locator('.text-selection-highlight-button').click();
  await page.waitForFunction((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return state.layers?.[0]?.backgroundEnabled === true;
  }, STORAGE_KEY);
  await page.waitForTimeout(50);

  const sampleAfter = await sampleCanvasPixel(page, {
    lineText: 'HELLO',
    pointX: 120,
    pointY: 364,
  });
  const savedState = await readSavedState(page);

  assert.deepEqual(sampleBefore.pixel, [255, 255, 255, 255]);
  assert.deepEqual(sampleAfter.pixel, [255, 243, 232, 255]);
  assert.equal(savedState.layers[0].backgroundEnabled, true);
  assert.equal(savedState.layers[0].backgroundColor, '#fff3e8');
});

test('text highlight style persists from quick text tools', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Cloud test',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /быстрые настройки текста/i }).click();
  await page.locator('.text-selection-highlight-button').click();
  await page
    .locator('.text-selection-popover')
    .getByRole('button', { name: 'Cloud' })
    .click();

  await page.waitForFunction((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return state.layers?.[0]?.backgroundStyle === 'cloud';
  }, STORAGE_KEY);

  const savedState = await readSavedState(page);
  assert.equal(savedState.layers[0].backgroundEnabled, true);
  assert.equal(savedState.layers[0].backgroundStyle, 'cloud');
});

test('saved text style appears in presets and survives reload', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Собранный стиль',
    fontStyle: 'italic',
    letterSpacing: 1.2,
    fontSize: 102,
    lineHeight: 1.45,
    align: 'center',
    color: '#d9683c',
    backgroundEnabled: true,
    backgroundColor: '#f6d6c7',
    backgroundStyle: 'sticker',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.getByRole('tab', { name: 'Пресет' }).click();
  await page.getByRole('button', { name: /сохранить стиль/i }).click();
  await page.waitForFunction((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return Array.isArray(state.textStylePresets) && state.textStylePresets.length === 1;
  }, STORAGE_KEY);

  await page.getByRole('button', { name: /сохранить стиль/i }).click();
  await page.waitForTimeout(80);

  let savedState = await readSavedState(page);
  assert.equal(savedState.textStylePresets.length, 1);
  assert.equal(savedState.textStylePresets[0].label, 'Мой стиль 1');
  assert.equal(savedState.textStylePresets[0].fontSize, 102);
  assert.equal(savedState.textStylePresets[0].lineHeight, 1.45);
  assert.equal(savedState.textStylePresets[0].align, 'center');
  assert.equal(savedState.textStylePresets[0].backgroundEnabled, true);
  assert.equal(savedState.textStylePresets[0].backgroundStyle, 'sticker');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Пресет' }).click();

  const presetLabels = await page.locator('.text-preset-label').allTextContents();
  assert.ok(presetLabels.includes('Мой стиль 1'));

  savedState = await readSavedState(page);
  assert.equal(savedState.textStylePresets.length, 1);
});

test('text tools popover stays clear of selected text on mobile', async (t) => {
  for (const scenario of [
    { label: 'top', y: 220 },
    { label: 'bottom', y: 1380 },
  ]) {
    await t.test(scenario.label, async (subtest) => {
      const textLayer = buildTextLayer({
        text: 'Проверка',
        y: scenario.y,
      });
      const { context, page } = await openMobilePage({
        state: buildState({
          selectedLayerId: textLayer.id,
          layers: [textLayer],
        }),
      });
      subtest.after(async () => context.close());

      await page.getByRole('button', { name: /быстрые настройки текста/i }).click();

      const positioning = await page.evaluate((storageKey) => {
        const frame = document.querySelector('.canvas-stage-frame');
        const popover = document.querySelector('.text-selection-popover');
        if (!(frame instanceof HTMLElement) || !(popover instanceof HTMLElement)) {
          return null;
        }

        const state = JSON.parse(localStorage.getItem(storageKey));
        const layer = state.layers[0];
        const frameRect = frame.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const scale = frameRect.height / 1920;
        const selectionTop = layer.y * scale;
        const selectionBottom = (layer.y + layer.height) * scale;
        const popoverTop = popoverRect.top - frameRect.top;
        const popoverBottom = popoverRect.bottom - frameRect.top;

        return {
          clearOfText:
            popoverTop >= selectionBottom || popoverBottom <= selectionTop,
        };
      }, STORAGE_KEY);

      assert.equal(positioning.clearOfText, true);
    });
  }
});

test('paste button inserts clipboard image as overlay instead of opening background picker', async (t) => {
  const sampleSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">' +
    '<circle cx="320" cy="320" r="260" fill="rgba(255,126,80,0.9)"/>' +
    '<circle cx="240" cy="260" r="40" fill="#fff"/>' +
    '<circle cx="400" cy="260" r="40" fill="#fff"/>' +
    '</svg>';

  const { context, page } = await openMobilePage({
    seedStorage: false,
    extraInitScripts: [
      {
        fn: (svg) => {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              read: async () => [
                {
                  types: ['image/svg+xml'],
                  getType: async (type) => new Blob([svg], { type }),
                },
              ],
              readText: async () => '',
            },
          });
        },
        arg: sampleSvg,
      },
    ],
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /^вставить$/i }).click();
  await waitForSavedLayerCount(page, 1);

  const savedState = await readSavedState(page);
  const hasModal = await page.locator('.modal-backdrop').count();

  assert.equal(savedState.layers.length, 1);
  assert.equal(savedState.layers[0].type, 'image');
  assert(savedState.layers[0].width > 70);
  assert(savedState.layers[0].height > 70);
  assert.equal(hasModal, 0);
});

test('uploaded font survives reload and can be deleted with confirmation', async (t) => {
  const textLayer = buildTextLayer();
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
    extraInitScripts: [
      {
        fn: () => {
          const FakeFontFace = class {
            constructor(family, source) {
              this.family = family;
              this.source = source;
            }

            async load() {
              return this;
            }
          };

          Object.defineProperty(window, 'FontFace', {
            configurable: true,
            value: FakeFontFace,
          });
          Object.defineProperty(document, 'fonts', {
            configurable: true,
            value: {
              add() {},
              delete() {},
            },
          });

          window.__confirmCalls = [];
          Object.defineProperty(window, 'confirm', {
            configurable: true,
            value: (message) => {
              window.__confirmCalls.push(message);
              return true;
            },
          });
        },
      },
    ],
  });
  t.after(async () => context.close());

  await page.locator('input[type="file"][accept=".ttf"]').setInputFiles({
    name: 'UploadedFont.ttf',
    mimeType: 'font/ttf',
    buffer: Buffer.from('fake-font-binary'),
  });
  await waitForSavedFontCount(page, 2);

  let savedState = await readSavedState(page);
  assert.equal(savedState.fonts.length, 2);
  const uploadedFont = savedState.fonts.find((font) => font.id !== 'default');
  assert(uploadedFont);

  await page.reload({ waitUntil: 'networkidle' });

  savedState = await readSavedState(page);
  assert.equal(savedState.fonts.length, 2);
  assert(savedState.fonts.some((font) => font.id === uploadedFont.id));

  await page.getByRole('button', { name: /открыть меню шрифтов в панели/i }).click();
  await page
    .locator('.font-picker-menu .font-picker-option-button')
    .filter({ hasText: uploadedFont.name })
    .click();

  await page.waitForFunction(
    async ({ storageKey, storageDbName, storageObjectStore, nextFamily }) => {
      const readLocalEnvelope = () => {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      };

      const readIndexedDbEnvelope = async () => {
        if (typeof indexedDB === 'undefined') {
          return null;
        }

        return new Promise((resolve) => {
          try {
            const request = indexedDB.open(storageDbName);
            request.onsuccess = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains(storageObjectStore)) {
                database.close();
                resolve(null);
                return;
              }

              try {
                const transaction = database.transaction(storageObjectStore, 'readonly');
                const store = transaction.objectStore(storageObjectStore);
                const getRequest = store.get(storageKey);
                getRequest.onsuccess = () => resolve(getRequest.result ?? null);
                getRequest.onerror = () => resolve(null);
                transaction.oncomplete = () => database.close();
                transaction.onerror = () => database.close();
                transaction.onabort = () => database.close();
              } catch {
                database.close();
                resolve(null);
              }
            };
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      };

      const localEnvelope = readLocalEnvelope();
      const indexedDbEnvelope = await readIndexedDbEnvelope();
      const localSavedAt = typeof localEnvelope?.savedAt === 'number' ? localEnvelope.savedAt : 0;
      const indexedDbSavedAt =
        typeof indexedDbEnvelope?.savedAt === 'number' ? indexedDbEnvelope.savedAt : 0;
      const latestEnvelope =
        localSavedAt >= indexedDbSavedAt ? localEnvelope : indexedDbEnvelope;

      return latestEnvelope?.layers?.[0]?.fontFamily === nextFamily;
    },
    {
      storageKey: STORAGE_KEY,
      storageDbName: STORAGE_DB_NAME,
      storageObjectStore: STORAGE_OBJECT_STORE,
      nextFamily: uploadedFont.family,
    },
  );

  await page.getByRole('button', { name: /открыть меню шрифтов в панели/i }).click();
  await page.getByRole('button', { name: new RegExp(`Удалить шрифт ${uploadedFont.name}`, 'i') }).click();
  await waitForSavedFontCount(page, 1);

  savedState = await readSavedState(page);
  assert.equal(savedState.fonts.length, 1);
  assert.equal(savedState.layers[0].fontFamily, 'Arial');

  const confirmCalls = await page.evaluate(() => window.__confirmCalls);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0], /Удалить шрифт/i);
});

test('export uses native share sheet with png file on mobile when supported', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Export me',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
    extraInitScripts: [
      {
        fn: () => {
          window.__shareCalls = [];

          Object.defineProperty(navigator, 'canShare', {
            configurable: true,
            value: (payload) => Boolean(payload?.files?.length),
          });

          Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (payload) => {
              window.__shareCalls.push({
                title: payload?.title ?? null,
                files:
                  payload?.files?.map((file) => ({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                  })) ?? [],
              });
            },
          });
        },
      },
    ],
  });
  t.after(async () => context.close());

  await page.getByRole('button', { name: /экспорт png/i }).click();
  await page.waitForFunction(() => window.__shareCalls?.length === 1);

  const shareCall = await page.evaluate(() => window.__shareCalls[0]);
  assert.equal(shareCall.files.length, 1);
  assert.match(shareCall.files[0].name, /^story-\d+\.png$/);
  assert.equal(shareCall.files[0].type, 'image/png');
  assert(shareCall.files[0].size > 0);
});

test('long press on canvas opens save preview image on mobile', async (t) => {
  const textLayer = buildTextLayer({
    text: 'Save me',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: textLayer.id,
      layers: [textLayer],
    }),
  });
  t.after(async () => context.close());

  await page
    .locator('.konvajs-content canvas')
    .dispatchEvent('pointerdown', {
      bubbles: true,
      pointerType: 'touch',
      clientX: 80,
      clientY: 120,
      isPrimary: true,
    });
  await page.waitForTimeout(380);
  await page
    .locator('.konvajs-content canvas')
    .dispatchEvent('pointerup', {
      bubbles: true,
      pointerType: 'touch',
      clientX: 80,
      clientY: 120,
      isPrimary: true,
    });

  await page.locator('.save-preview-image').waitFor({ state: 'visible' });

  const previewInfo = await page.evaluate(() => {
    const image = document.querySelector('.save-preview-image');
    if (!(image instanceof HTMLImageElement)) {
      return null;
    }

    return {
      src: image.currentSrc || image.src,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  });

  assert(previewInfo);
  assert.match(previewInfo.src, /^(blob:|data:image\/png)/);
  assert(previewInfo.width > 0);
  assert(previewInfo.height > 0);
});

test('uploaded background is persisted as stage-sized asset and survives reload', async (t) => {
  const hugeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="9000" viewBox="0 0 6000 9000">' +
    '<rect width="6000" height="9000" fill="#d6a27d"/>' +
    '<circle cx="3000" cy="3200" r="1600" fill="#f8efe4"/>' +
    '<rect x="1200" y="5200" width="3600" height="1800" rx="320" fill="#8f4c2a"/>' +
    '</svg>';

  const { context, page } = await openMobilePage();
  t.after(async () => context.close());

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'huge-background.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(hugeSvg),
  });

  await page.locator('.image-picker').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /использовать фото/i }).click();
  await waitForSavedLayerCount(page, 1);

  let savedState = await readSavedState(page);
  assert.equal(savedState.layers.length, 1);
  assert.equal(savedState.layers[0].kind, 'background');
  assert.equal(savedState.layers[0].naturalWidth, 1080);
  assert.equal(savedState.layers[0].naturalHeight, 1920);

  await page.reload({ waitUntil: 'networkidle' });

  savedState = await readSavedState(page);
  assert.equal(savedState.layers.length, 1);
  assert.equal(savedState.layers[0].kind, 'background');
  assert.equal(savedState.layers[0].naturalWidth, 1080);
  assert.equal(savedState.layers[0].naturalHeight, 1920);
});

test('background survives reload and clipboard sticker paste', async (t) => {
  const hugeSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="9000" viewBox="0 0 6000 9000">' +
    '<rect width="6000" height="9000" fill="#d6a27d"/>' +
    '<circle cx="3000" cy="3200" r="1600" fill="#f8efe4"/>' +
    '<rect x="1200" y="5200" width="3600" height="1800" rx="320" fill="#8f4c2a"/>' +
    '</svg>';
  const sampleSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">' +
    '<rect width="480" height="480" rx="180" fill="#f97316"/>' +
    '</svg>';

  const { context, page } = await openMobilePage({
    extraInitScripts: [
      {
        fn: (svg) => {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              read: async () => [
                {
                  types: ['image/svg+xml'],
                  getType: async (type) => new Blob([svg], { type }),
                },
              ],
              readText: async () => '',
            },
          });
        },
        arg: sampleSvg,
      },
    ],
  });
  t.after(async () => context.close());

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'return-background.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(hugeSvg),
  });
  await page.locator('.image-picker').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /использовать фото/i }).click();
  await waitForSavedLayerCount(page, 1);

  await page.reload({ waitUntil: 'networkidle' });

  const restoredState = await readSavedState(page);
  assert.equal(restoredState.layers.length, 1);
  assert.equal(restoredState.layers[0].kind, 'background');

  await page.getByRole('button', { name: /^вставить$/i }).click();
  await waitForSavedLayerCount(page, 2);
  await page.waitForTimeout(400);

  const savedState = await readSavedState(page);
  const kinds = savedState.layers.map((layer) => layer.kind);

  assert.equal(savedState.layers.length, 2);
  assert.deepEqual(kinds, ['background', 'overlay']);
});

test('selection toolbar can move image layer to top and bottom of stack', async (t) => {
  const imageLayer = buildImageLayer();
  const textLayer = buildTextLayer({
    id: 'text-2',
    text: 'Над картинкой',
  });
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: imageLayer.id,
      layers: [imageLayer, textLayer],
    }),
  });
  t.after(async () => context.close());

  await page.locator('.text-selection-toolbar').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: /перенести слой в самый верх/i }).click();
  await page.waitForFunction(({ storageKey, selectedId }) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return (
      state.selectedLayerId === selectedId &&
      state.layers?.[state.layers.length - 1]?.id === selectedId
    );
  }, { storageKey: STORAGE_KEY, selectedId: imageLayer.id });

  let savedState = await readSavedState(page);
  assert.deepEqual(savedState.layers.map((layer) => layer.id), [textLayer.id, imageLayer.id]);
  assert.equal(savedState.selectedLayerId, imageLayer.id);

  await page.getByRole('button', { name: /перенести слой в самый низ/i }).click();
  await page.waitForFunction(({ storageKey, selectedId }) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return false;
    }

    const state = JSON.parse(raw);
    return state.layers?.[0]?.id === selectedId;
  }, { storageKey: STORAGE_KEY, selectedId: imageLayer.id });

  savedState = await readSavedState(page);
  assert.deepEqual(savedState.layers.map((layer) => layer.id), [imageLayer.id, textLayer.id]);
});

test('overlay sticker can be picked up and dragged on mobile without drag arming', async (t) => {
  const imageLayer = buildImageLayer();
  const { context, page } = await openMobilePage({
    state: buildState({
      layers: [imageLayer],
    }),
  });
  t.after(async () => context.close());

  const projection = await readArtboardProjection(page);
  assert(projection);

  const startX =
    projection.frameX +
    (projection.offsetX + imageLayer.x + imageLayer.width / 2) * projection.scale;
  const startY =
    projection.frameY +
    (projection.offsetY + imageLayer.y + imageLayer.height / 2) * projection.scale;

  await dispatchSingleTouchDrag(page, {
    startX,
    startY,
    endX: startX + 42,
    endY: startY + 54,
  });

  const savedState = await readSavedState(page);
  const movedLayer = savedState.layers.find((layer) => layer.id === imageLayer.id);
  assert(movedLayer);
  assert.notEqual(movedLayer.x, imageLayer.x);
  assert.notEqual(movedLayer.y, imageLayer.y);
  assert.equal(savedState.selectedLayerId, imageLayer.id);
});
