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

async function sampleCanvasPixel(page, sample) {
  return page.evaluate(({ lineText, pointX, pointY }) => {
    const canvas = document.querySelector('.konvajs-content canvas');
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
    const ratio = canvas.width / 1080;
    const sampleX = Math.round((pointX + lineWidth + 12) * ratio);
    const sampleY = Math.round(pointY * ratio);

    return {
      sampleX,
      sampleY,
      pixel: Array.from(context.getImageData(sampleX, sampleY, 1, 1).data),
    };
  }, sample);
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
        width: bounds.width,
        height: bounds.height,
      };
    };

    return {
      isExpanded: Boolean(column),
      frame: rect(frame),
      hasHint: Boolean(hint),
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  assert.equal(metrics.isExpanded, true);
  assert(metrics.frame.width >= 385);
  assert(metrics.frame.height >= 830);
  assert.equal(metrics.hasHint, false);
  assert(metrics.scrollHeight <= MOBILE_VIEWPORT.height);
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

  assert.deepEqual(sampleBefore.pixel, [0, 0, 0, 0]);
  assert.deepEqual(sampleAfter.pixel, [255, 243, 232, 255]);
  assert.equal(savedState.layers[0].backgroundEnabled, true);
  assert.equal(savedState.layers[0].backgroundColor, '#fff3e8');
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

  const savedState = await readSavedState(page);
  const kinds = savedState.layers.map((layer) => layer.kind);

  assert.equal(savedState.layers.length, 2);
  assert.deepEqual(kinds, ['background', 'overlay']);
});

test('overlay sticker drags immediately on mobile without drag arming', async (t) => {
  const imageLayer = buildImageLayer();
  const { context, page } = await openMobilePage({
    state: buildState({
      selectedLayerId: imageLayer.id,
      layers: [imageLayer],
    }),
  });
  t.after(async () => context.close());

  const frameBox = await page.locator('.canvas-stage-frame').boundingBox();
  assert(frameBox);

  const scale = frameBox.width / 1080;
  const startX = frameBox.x + (imageLayer.x + imageLayer.width / 2) * scale;
  const startY = frameBox.y + (imageLayer.y + imageLayer.height / 2) * scale;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 42, startY + 54, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const savedState = await readSavedState(page);
  const movedLayer = savedState.layers.find((layer) => layer.id === imageLayer.id);
  assert(movedLayer);
  assert.notEqual(movedLayer.x, imageLayer.x);
  assert.notEqual(movedLayer.y, imageLayer.y);
});
