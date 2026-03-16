import {
  DEFAULT_FONT,
  ImageCrop,
  Layer,
  Preset,
  PersistedLayer,
  PersistedImageLayer,
  UploadedFont,
} from '../editor/types';
import { isBuiltInFontFamily } from '../editor/textPresets';
import { DEFAULT_TEXT_BACKGROUND_COLOR } from '../editor/textHighlight';
import { loadImage } from './media';

type PersistedEnvelope = {
  preset?: Preset;
  selectedLayerId?: string | null;
  fonts?: unknown[];
  layers?: unknown[];
  savedAt?: number;
};

const STORAGE_KEY = 'story-text-editor-state-v1';
const STORAGE_DB_NAME = 'story-text-editor-storage';
const STORAGE_DB_VERSION = 1;
const STORAGE_OBJECT_STORE = 'state';

const normalizeFont = (value: unknown): UploadedFont | null => {
  if (!value || typeof value !== 'object') return null;

  const font = value as {
    id?: string;
    name?: string;
    family?: string;
    dataUrl?: unknown;
  };

  if (typeof font.id !== 'string' || typeof font.name !== 'string' || typeof font.family !== 'string') {
    return null;
  }

  const isCustomFont = font.id !== 'default';
  if (isCustomFont && typeof font.dataUrl !== 'string') {
    return null;
  }

  return {
    id: font.id,
    name: font.name,
    family: font.family,
    dataUrl: isCustomFont ? font.dataUrl : undefined,
  };
};

const normalizeCrop = (value: unknown): ImageCrop | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const crop = value as {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  };

  if (
    typeof crop.x !== 'number' ||
    typeof crop.y !== 'number' ||
    typeof crop.width !== 'number' ||
    typeof crop.height !== 'number'
  ) {
    return null;
  }

  return {
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
  };
};

const normalizeLayer = (value: unknown): PersistedLayer | null => {
  if (!value || typeof value !== 'object') return null;

  const layer = value as {
    id?: string;
    type?: string;
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
    rotation?: unknown;
  };

  if (
    typeof layer.id !== 'string' ||
    (layer.type !== 'image' && layer.type !== 'text') ||
    typeof layer.x !== 'number' ||
    typeof layer.y !== 'number' ||
    typeof layer.width !== 'number' ||
    typeof layer.height !== 'number' ||
    typeof layer.rotation !== 'number'
  ) {
    return null;
  }

  if (layer.type === 'text') {
    const textLayer = value as {
      text?: unknown;
      fontFamily?: unknown;
      fontStyle?: unknown;
      letterSpacing?: unknown;
      fontSize?: unknown;
      lineHeight?: unknown;
      align?: unknown;
      color?: unknown;
      backgroundEnabled?: unknown;
      backgroundColor?: unknown;
      stylePresetId?: unknown;
    };

    if (
      typeof textLayer.text !== 'string' ||
      typeof textLayer.fontFamily !== 'string' ||
      (textLayer.fontStyle !== undefined &&
        textLayer.fontStyle !== 'normal' &&
        textLayer.fontStyle !== 'bold' &&
        textLayer.fontStyle !== 'italic' &&
        textLayer.fontStyle !== 'bold italic') ||
      (textLayer.letterSpacing !== undefined && typeof textLayer.letterSpacing !== 'number') ||
      typeof textLayer.fontSize !== 'number' ||
      typeof textLayer.lineHeight !== 'number' ||
      (textLayer.align !== 'left' && textLayer.align !== 'center' && textLayer.align !== 'right') ||
      typeof textLayer.color !== 'string' ||
      (textLayer.backgroundEnabled !== undefined && typeof textLayer.backgroundEnabled !== 'boolean') ||
      (textLayer.backgroundColor !== undefined && typeof textLayer.backgroundColor !== 'string') ||
      (textLayer.stylePresetId !== undefined && typeof textLayer.stylePresetId !== 'string')
    ) {
      return null;
    }

    return {
      id: layer.id,
      type: 'text',
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
      text: textLayer.text,
      fontFamily: textLayer.fontFamily,
      fontStyle: textLayer.fontStyle,
      letterSpacing: textLayer.letterSpacing,
      fontSize: textLayer.fontSize,
      lineHeight: textLayer.lineHeight,
      align: textLayer.align,
      color: textLayer.color,
      backgroundEnabled: textLayer.backgroundEnabled ?? false,
      backgroundColor: textLayer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR,
      stylePresetId: textLayer.stylePresetId,
    };
  }

  const imageLayer = value as {
    kind?: unknown;
    src?: unknown;
    naturalWidth?: unknown;
    naturalHeight?: unknown;
    crop?: unknown;
  };

  const crop = normalizeCrop(imageLayer.crop);
  if (
    typeof imageLayer.src !== 'string' ||
    typeof imageLayer.naturalWidth !== 'number' ||
    typeof imageLayer.naturalHeight !== 'number' ||
    !crop
  ) {
    return null;
  }

  return {
    id: layer.id,
    type: 'image',
    kind: imageLayer.kind === 'overlay' ? 'overlay' : 'background',
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    src: imageLayer.src,
    naturalWidth: imageLayer.naturalWidth,
    naturalHeight: imageLayer.naturalHeight,
    crop,
  };
};

const readEnvelopeFromLocalStorage = (): PersistedEnvelope | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedEnvelope;
  } catch {
    return null;
  }
};

const getEnvelopeSavedAt = (value: PersistedEnvelope | null) =>
  typeof value?.savedAt === 'number' ? value.savedAt : 0;

const pickMostRecentEnvelope = (
  localEnvelope: PersistedEnvelope | null,
  indexedDbEnvelope: PersistedEnvelope | null,
) => {
  if (!localEnvelope) {
    return indexedDbEnvelope;
  }

  if (!indexedDbEnvelope) {
    return localEnvelope;
  }

  return getEnvelopeSavedAt(localEnvelope) >= getEnvelopeSavedAt(indexedDbEnvelope)
    ? localEnvelope
    : indexedDbEnvelope;
};

const openStorageDatabase = async () => {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORAGE_OBJECT_STORE)) {
          database.createObjectStore(STORAGE_OBJECT_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const readEnvelopeFromIndexedDb = async (): Promise<PersistedEnvelope | null> => {
  const database = await openStorageDatabase();
  if (!database) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORAGE_OBJECT_STORE, 'readonly');
      const store = transaction.objectStore(STORAGE_OBJECT_STORE);
      const request = store.get(STORAGE_KEY);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result && typeof result === 'object' ? (result as PersistedEnvelope) : null);
      };
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
      transaction.onabort = () => database.close();
    } catch {
      database.close();
      resolve(null);
    }
  });
};

const writeEnvelopeToIndexedDb = async (payload: PersistedEnvelope) => {
  const database = await openStorageDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORAGE_OBJECT_STORE, 'readwrite');
      const store = transaction.objectStore(STORAGE_OBJECT_STORE);
      store.put(payload, STORAGE_KEY);

      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        resolve();
      };
    } catch {
      database.close();
      resolve();
    }
  });
};

const buildImage = async (layer: PersistedImageLayer) => {
  const image = await loadImage(layer.src);
  return {
    ...layer,
    image,
  };
};

export type EditorPersistedState = {
  preset: Preset;
  selectedLayerId: string | null;
  layers: Layer[];
  fonts: UploadedFont[];
};

export const readState = async (): Promise<EditorPersistedState | null> => {
  try {
    const localEnvelope = readEnvelopeFromLocalStorage();
    const indexedDbEnvelope = await readEnvelopeFromIndexedDb();
    const parsed = pickMostRecentEnvelope(localEnvelope, indexedDbEnvelope);
    if (!parsed) return null;
    const restoredPreset: Preset = parsed.preset === 'carousel' ? 'carousel' : 'story';
    const restoredFonts = [
      DEFAULT_FONT,
      ...(Array.isArray(parsed.fonts)
        ? parsed.fonts
            .map(normalizeFont)
            .filter((font): font is UploadedFont => Boolean(font) && font.id !== 'default')
        : []),
    ];

    const fontFamilies = new Set(restoredFonts.map((font) => font.family));

    await Promise.all(
      restoredFonts.map(async (font) => {
        if (!font.dataUrl) return;
        try {
          const fontResponse = await fetch(font.dataUrl);
          const fontBuffer = await fontResponse.arrayBuffer();
          const loadedFont = new FontFace(font.family, fontBuffer);
          await loadedFont.load();
          document.fonts.add(loadedFont);
        } catch {
          // ignore invalid stored fonts
        }
      }),
    );

    const parsedLayers = Array.isArray(parsed.layers)
      ? (parsed.layers as unknown[])
          .map(normalizeLayer)
          .filter((layer): layer is PersistedLayer => Boolean(layer))
      : [];

    const restoredLayers = await Promise.all(
      parsedLayers.map(async (layer) => {
        if (layer.type === 'text') {
          return {
            ...layer,
            fontFamily: fontFamilies.has(layer.fontFamily) || isBuiltInFontFamily(layer.fontFamily)
              ? layer.fontFamily
              : DEFAULT_FONT.family,
          };
        }

        if (!layer.src.startsWith('data:')) {
          return null;
        }

        try {
          const imageLayer: PersistedImageLayer = {
            ...layer,
            type: 'image',
          };
          const loaded = (await buildImage(imageLayer)) as Layer;
          return loaded;
        } catch {
          return null;
        }
      }),
    );

    const normalized = restoredLayers.filter(
      (layer): layer is Layer =>
        layer !== null && (layer.type !== 'image' || layer.image.naturalWidth > 0),
    );

    const nextSelectedLayerId = typeof parsed.selectedLayerId === 'string' ? parsed.selectedLayerId : null;
    const hasSelectedLayer = normalized.some((layer) => layer.id === nextSelectedLayerId);

    return {
      preset: restoredPreset,
      selectedLayerId: hasSelectedLayer ? nextSelectedLayerId : null,
      layers: normalized,
      fonts: restoredFonts,
    };
  } catch {
    return null;
  }
};

export const saveState = async (state: EditorPersistedState) => {
  const serializableLayers = state.layers.map((layer) => {
    if (layer.type === 'image') {
      const { image, ...rest } = layer;
      return rest;
    }

    return layer;
  });

  const payload = {
    preset: state.preset,
    selectedLayerId: state.selectedLayerId,
    fonts: state.fonts,
    layers: serializableLayers,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage issues
  }

  await writeEnvelopeToIndexedDb(payload);
};
