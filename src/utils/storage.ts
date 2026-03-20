import {
  CollageLayout,
  CompositionMode,
  DEFAULT_FONT,
  ImageCrop,
  Layer,
  Preset,
  PersistedLayer,
  PersistedImageLayer,
  UploadedFont,
} from '../editor/types';
import { isBuiltInFontFamily, TextStylePreset } from '../editor/textPresets';
import { DEFAULT_TEXT_BACKGROUND_COLOR, DEFAULT_TEXT_BACKGROUND_STYLE } from '../editor/textHighlight';
import { getDefaultCollageSpacing } from '../editor/collage';
import { loadImage } from './media';

type PersistedEnvelope = {
  preset?: Preset;
  compositionMode?: CompositionMode;
  collageLayout?: CollageLayout;
  collageSpacing?: number;
  selectedLayerId?: string | null;
  fonts?: unknown[];
  textStylePresets?: unknown[];
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

const normalizeTextBackgroundStyle = (value: unknown) => {
  if (value === 'frosted') {
    return 'block' as const;
  }

  if (value === 'marker') {
    return 'frame' as const;
  }

  if (
    value === 'soft' ||
    value === 'sharp' ||
    value === 'cloud' ||
    value === 'block' ||
    value === 'frame' ||
    value === 'sticker'
  ) {
    return value;
  }

  return null;
};

const normalizeTextStylePreset = (value: unknown): TextStylePreset | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const preset = value as {
    id?: unknown;
    label?: unknown;
    description?: unknown;
    sample?: unknown;
    source?: unknown;
    family?: unknown;
    fontStyle?: unknown;
    letterSpacing?: unknown;
    fontSize?: unknown;
    lineHeight?: unknown;
    align?: unknown;
    color?: unknown;
    backgroundEnabled?: unknown;
    backgroundColor?: unknown;
    backgroundStyle?: unknown;
  };

  if (
    typeof preset.id !== 'string' ||
    typeof preset.label !== 'string' ||
    typeof preset.description !== 'string' ||
    typeof preset.sample !== 'string' ||
    (preset.source !== undefined && preset.source !== 'builtin' && preset.source !== 'custom') ||
    typeof preset.family !== 'string' ||
    (preset.fontStyle !== 'normal' &&
      preset.fontStyle !== 'bold' &&
      preset.fontStyle !== 'italic' &&
      preset.fontStyle !== 'bold italic') ||
    typeof preset.letterSpacing !== 'number' ||
    typeof preset.fontSize !== 'number' ||
    typeof preset.lineHeight !== 'number' ||
    (preset.align !== 'left' && preset.align !== 'center' && preset.align !== 'right') ||
    typeof preset.color !== 'string' ||
    typeof preset.backgroundEnabled !== 'boolean' ||
    typeof preset.backgroundColor !== 'string' ||
    normalizeTextBackgroundStyle(preset.backgroundStyle) === null
  ) {
    return null;
  }

  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    sample: preset.sample,
    source: preset.source ?? 'custom',
    family: preset.family,
    fontStyle: preset.fontStyle,
    letterSpacing: preset.letterSpacing,
    fontSize: preset.fontSize,
    lineHeight: preset.lineHeight,
    align: preset.align,
    color: preset.color,
    backgroundEnabled: preset.backgroundEnabled,
    backgroundColor: preset.backgroundColor,
    backgroundStyle: normalizeTextBackgroundStyle(preset.backgroundStyle) ?? DEFAULT_TEXT_BACKGROUND_STYLE,
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
      backgroundStyle?: unknown;
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
      (textLayer.backgroundStyle !== undefined &&
        normalizeTextBackgroundStyle(textLayer.backgroundStyle) === null) ||
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
      backgroundStyle:
        normalizeTextBackgroundStyle(textLayer.backgroundStyle) ?? DEFAULT_TEXT_BACKGROUND_STYLE,
      stylePresetId: textLayer.stylePresetId,
    };
  }

  const imageLayer = value as {
    kind?: unknown;
    slotId?: unknown;
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
    kind:
      imageLayer.kind === 'overlay'
        ? 'overlay'
        : imageLayer.kind === 'collage'
          ? 'collage'
          : 'background',
    slotId: typeof imageLayer.slotId === 'string' ? imageLayer.slotId : undefined,
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
  compositionMode: CompositionMode;
  collageLayout: CollageLayout;
  collageSpacing: number;
  selectedLayerId: string | null;
  layers: Layer[];
  fonts: UploadedFont[];
  textStylePresets: TextStylePreset[];
};

export const readState = async (): Promise<EditorPersistedState | null> => {
  try {
    const localEnvelope = readEnvelopeFromLocalStorage();
    const indexedDbEnvelope = await readEnvelopeFromIndexedDb();
    const parsed = pickMostRecentEnvelope(localEnvelope, indexedDbEnvelope);
    if (!parsed) return null;
    const restoredPreset: Preset = parsed.preset === 'carousel' ? 'carousel' : 'story';
    const restoredCompositionMode: CompositionMode =
      parsed.compositionMode === 'collage' ? 'collage' : 'single';
    const restoredCollageLayout: CollageLayout =
      parsed.collageLayout === 'stack-2'
        ? 'stack-2'
        : parsed.collageLayout === 'stack-3'
          ? 'stack-3'
          : 'grid-4';
    const restoredCollageSpacing =
      typeof parsed.collageSpacing === 'number' && Number.isFinite(parsed.collageSpacing)
        ? parsed.collageSpacing
        : getDefaultCollageSpacing(1080, restoredPreset === 'carousel' ? 1350 : 1920);
    const restoredFonts = [
      DEFAULT_FONT,
      ...(Array.isArray(parsed.fonts)
        ? parsed.fonts
            .map(normalizeFont)
            .filter((font): font is UploadedFont => Boolean(font) && font.id !== 'default')
        : []),
    ];

    const fontFamilies = new Set(restoredFonts.map((font) => font.family));
    const restoredTextStylePresets = Array.isArray(parsed.textStylePresets)
      ? parsed.textStylePresets
          .map(normalizeTextStylePreset)
          .filter((preset): preset is TextStylePreset => Boolean(preset))
          .map((preset) => ({
            ...preset,
            family: fontFamilies.has(preset.family) || isBuiltInFontFamily(preset.family)
              ? preset.family
              : DEFAULT_FONT.family,
          }))
      : [];

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
      compositionMode:
        restoredCompositionMode === 'collage' || normalized.some((layer) => layer.type === 'image' && layer.kind === 'collage')
          ? 'collage'
          : 'single',
      collageLayout: restoredCollageLayout,
      collageSpacing: restoredCollageSpacing,
      selectedLayerId: hasSelectedLayer ? nextSelectedLayerId : null,
      layers: normalized,
      fonts: restoredFonts,
      textStylePresets: restoredTextStylePresets,
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
    compositionMode: state.compositionMode,
    collageLayout: state.collageLayout,
    collageSpacing: state.collageSpacing,
    selectedLayerId: state.selectedLayerId,
    fonts: state.fonts,
    textStylePresets: state.textStylePresets,
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
