import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Konva from 'konva';
import { nanoid } from 'nanoid';

import { TopBar } from './components/TopBar';
import { ActionRail } from './components/ActionRail';
import { EditorCanvas } from './components/EditorCanvas';
import { FormatPicker } from './components/FormatPicker';
import { PropertiesPanel } from './components/PropertiesPanel';
import { SymbolPicker } from './components/SymbolPicker';
import {
  CollageLayout,
  CompositionMode,
  DEFAULT_FONT,
  ImageCrop,
  Layer,
  TextBackgroundStyle,
  TextLayer,
  UploadedFont,
  Preset,
  PRESETS,
} from './editor/types';
import {
  COLLAGE_MAX_SPACING,
  COLLAGE_MIN_SPACING,
  clampCollageImageGeometry,
  getDefaultCollageSpacing,
  getDefaultCollageOverscan,
  getCollageLayoutDefinition,
  getCollageScaleFromGeometry,
  getCollageSlots,
  getSlotCoverPlacement,
  remapCollageGeometry,
  scaleCollageGeometry,
} from './editor/collage';
import { DEFAULT_TEXT_BACKGROUND_COLOR, DEFAULT_TEXT_BACKGROUND_STYLE } from './editor/textHighlight';
import {
  createCustomTextStylePreset,
  DEFAULT_TEXT_STYLE_PRESET_ID,
  doesTextStylePresetMatchLayer,
  getAvailableTextStylePresets,
  getFontOptions,
  getNextCustomTextStylePresetLabel,
  getTextStylePresetById,
  TextStylePreset,
} from './editor/textPresets';
import { dataUrlToBlob, rasterizeBackgroundImage, readFileAsDataUrl, loadImage } from './utils/media';
import { clamp } from './utils/math';
import { readState, saveState, type EditorPersistedState } from './utils/storage';

const LazyImagePicker = lazy(async () => {
  const module = await import('./components/ImagePicker');
  return {
    default: module.ImagePicker,
  };
});

function getPresetByKey(preset: Preset) {
  return PRESETS.find((item) => item.key === preset)!;
}

type ClipboardImageMode = 'background' | 'overlay' | 'collage';
type PreparedImage = {
  id: string;
  dataUrl: string;
  image: HTMLImageElement;
};

type CanvasWorkspace = {
  viewportWidth: number;
  viewportHeight: number;
  offsetX: number;
  offsetY: number;
};

function App() {
  const [preset, setPreset] = useState<Preset>('story');
  const [compositionMode, setCompositionMode] = useState<CompositionMode>('single');
  const [collageLayout, setCollageLayout] = useState<CollageLayout>('grid-4');
  const [collageSpacing, setCollageSpacing] = useState(() => getDefaultCollageSpacing(1080, 1920));
  const [collageSwapSourceLayerId, setCollageSwapSourceLayerId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [dragArmedImageId, setDragArmedImageId] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const [isFormatPickerOpen, setIsFormatPickerOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<Preset>('story');
  const [draftCompositionMode, setDraftCompositionMode] = useState<CompositionMode>('single');
  const [draftCollageLayout, setDraftCollageLayout] = useState<CollageLayout>('grid-4');
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [isTextToolsOpen, setIsTextToolsOpen] = useState(false);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<UploadedFont[]>([DEFAULT_FONT]);
  const [customTextStylePresets, setCustomTextStylePresets] = useState<TextStylePreset[]>([]);
  const [stageScale, setStageScale] = useState(1);
  const [compactViewportPixels, setCompactViewportPixels] = useState({ width: 0, height: 0 });
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [fullscreenPan, setFullscreenPan] = useState({ x: 0, y: 0 });
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    image: HTMLImageElement;
  } | null>(null);
  const [isSymbolPickerOpen, setIsSymbolPickerOpen] = useState(false);
  const [savePreviewUrl, setSavePreviewUrl] = useState<string | null>(null);
  const [isPreparingSavePreview, setIsPreparingSavePreview] = useState(false);

  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const lastEnabledCollageSpacingRef = useRef(collageSpacing > 0 ? collageSpacing : getDefaultCollageSpacing(1080, 1920));
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const persistedStateRef = useRef<EditorPersistedState | null>(null);
  const defaultTextPreset = getTextStylePresetById(DEFAULT_TEXT_STYLE_PRESET_ID, customTextStylePresets);

  const stageSize = useMemo(() => getPresetByKey(preset), [preset]);
  const collageSlots = useMemo(
    () => getCollageSlots(collageLayout, stageSize.width, stageSize.height, collageSpacing),
    [collageLayout, collageSpacing, stageSize.height, stageSize.width],
  );
  const collageLayoutDefinition = useMemo(
    () => getCollageLayoutDefinition(collageLayout),
    [collageLayout],
  );

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );
  const selectedLayerIndex = useMemo(
    () => (selectedLayerId ? layers.findIndex((layer) => layer.id === selectedLayerId) : -1),
    [layers, selectedLayerId],
  );
  const isSelectedCollageImage =
    selectedLayer?.type === 'image' && selectedLayer.kind === 'collage';
  const isCollageSwapMode = collageSwapSourceLayerId !== null;
  const canSendSelectedLayerToBack = !isSelectedCollageImage && selectedLayerIndex > 0;
  const canBringSelectedLayerToFront =
    !isSelectedCollageImage && selectedLayerIndex !== -1 && selectedLayerIndex < layers.length - 1;
  const hasBackgroundLayer = layers.some(
    (layer) => layer.type === 'image' && layer.kind === 'background',
  );
  const collageLayers = useMemo(
    () =>
      layers.filter(
        (layer): layer is Extract<Layer, { type: 'image' }> =>
          layer.type === 'image' && layer.kind === 'collage',
      ),
    [layers],
  );
  const collageSlotOrder = useMemo(() => collageSlots.map((slot) => slot.id), [collageSlots]);
  const filledCollageSlotIds = useMemo(
    () => new Set(collageLayers.map((layer) => layer.slotId).filter((slotId): slotId is string => Boolean(slotId))),
    [collageLayers],
  );
  const isCollageReady = collageLayers.length >= collageSlots.length && collageSlots.length > 0;
  const isPhoneViewport = viewport.width <= 720;
  const canvasWorkspace = useMemo(
    () => {
      if (isPhoneViewport && !isCanvasExpanded && stageScale > 0) {
        const viewportWidth = Math.max(stageSize.width, compactViewportPixels.width / stageScale);
        const viewportHeight = Math.max(stageSize.height, compactViewportPixels.height / stageScale);

        return {
          viewportWidth,
          viewportHeight,
          offsetX: (viewportWidth - stageSize.width) / 2,
          offsetY: (viewportHeight - stageSize.height) / 2,
        };
      }

      return {
        viewportWidth: stageSize.width,
        viewportHeight: stageSize.height,
        offsetX: 0,
        offsetY: 0,
      };
    },
    [
      compactViewportPixels.height,
      compactViewportPixels.width,
      isCanvasExpanded,
      isPhoneViewport,
      stageScale,
      stageSize.height,
      stageSize.width,
    ],
  );
  const fontOptions = useMemo(() => getFontOptions(fonts), [fonts]);
  const textStylePresets = useMemo(
    () => getAvailableTextStylePresets(customTextStylePresets),
    [customTextStylePresets],
  );

  const getCollageSlotById = (slotId: string | undefined) =>
    collageSlots.find((slot) => slot.id === slotId) ?? null;
  const selectedCollageScale = useMemo(() => {
    if (!(selectedLayer?.type === 'image' && selectedLayer.kind === 'collage')) {
      return null;
    }

    const slot = collageSlots.find((item) => item.id === selectedLayer.slotId) ?? null;
    if (!slot) {
      return null;
    }

    return getCollageScaleFromGeometry(slot, {
      width: selectedLayer.width,
      height: selectedLayer.height,
    });
  }, [collageSlots, selectedLayer]);

  const getImageSourceSize = (
    layer:
      | Extract<Layer, { type: 'image' }>
      | {
          naturalWidth: number;
          naturalHeight: number;
          crop?: ImageCrop;
        },
  ) => ({
    width: Math.max(1, layer.naturalWidth * ((layer.crop?.width ?? 100) / 100)),
    height: Math.max(1, layer.naturalHeight * ((layer.crop?.height ?? 100) / 100)),
  });

  const buildCollageLayer = (prepared: PreparedImage, slotId: string) => {
    const slot = getCollageSlotById(slotId);
    if (!slot) {
      return null;
    }

    const sourceSize = getImageSourceSize({
      naturalWidth: prepared.image.naturalWidth || prepared.image.width,
      naturalHeight: prepared.image.naturalHeight || prepared.image.height,
      crop: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    });
    const placement = getSlotCoverPlacement(slot, sourceSize.width, sourceSize.height, {
      overscan: getDefaultCollageOverscan(collageLayout),
    });

    return createImageLayer(prepared.image, prepared.dataUrl, {
      kind: 'collage',
      slotId,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
  };

  const getNextCollageSlotId = (currentLayers: Layer[], preferredSlotId?: string | null) => {
    if (preferredSlotId && collageSlotOrder.includes(preferredSlotId)) {
      return preferredSlotId;
    }

    const occupied = new Set(
      currentLayers
        .filter(
          (layer): layer is Extract<Layer, { type: 'image' }> =>
            layer.type === 'image' && layer.kind === 'collage',
        )
        .map((layer) => layer.slotId)
        .filter((slotId): slotId is string => Boolean(slotId)),
    );

    return collageSlotOrder.find((slotId) => !occupied.has(slotId)) ?? null;
  };

  const remapCollageLayers = (
    currentLayers: Layer[],
    currentSlots: ReturnType<typeof getCollageSlots>,
    nextSlots: ReturnType<typeof getCollageSlots>,
  ) => {
    const nextSlotMap = new Map(nextSlots.map((slot) => [slot.id, slot]));
    const currentSlotMap = new Map(currentSlots.map((slot) => [slot.id, slot]));
    const nextSlotOrder = nextSlots.map((slot) => slot.id);
    const usedSlotIds = new Set<string>();
    let fallbackSourceSlotIndex = 0;

    return currentLayers.flatMap((layer) => {
      if (!(layer.type === 'image' && layer.kind === 'collage')) {
        return [layer];
      }

      const nextSlotId =
        layer.slotId && nextSlotMap.has(layer.slotId)
          ? layer.slotId
          : nextSlotOrder.find((slotId) => !usedSlotIds.has(slotId));
      if (!nextSlotId) {
        return [];
      }

      usedSlotIds.add(nextSlotId);
      const previousSlot =
        (layer.slotId ? currentSlotMap.get(layer.slotId) : null) ??
        currentSlots[fallbackSourceSlotIndex] ??
        currentSlots[currentSlots.length - 1];
      fallbackSourceSlotIndex += 1;
      const nextSlot = nextSlotMap.get(nextSlotId);
      if (!previousSlot || !nextSlot) {
        return [];
      }

      const nextGeometry = remapCollageGeometry(
        {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
        },
        previousSlot,
        nextSlot,
      );

      return [
        {
          ...layer,
          slotId: nextSlotId,
          rotation: 0,
          ...nextGeometry,
        },
      ];
    });
  };

  const swapCollageLayers = (sourceLayerId: string, targetLayerId: string) => {
    if (sourceLayerId === targetLayerId) {
      return;
    }

    const sourceLayer = layers.find(
      (layer): layer is Extract<Layer, { type: 'image' }> =>
        layer.id === sourceLayerId && layer.type === 'image' && layer.kind === 'collage',
    );
    const targetLayer = layers.find(
      (layer): layer is Extract<Layer, { type: 'image' }> =>
        layer.id === targetLayerId && layer.type === 'image' && layer.kind === 'collage',
    );
    if (!sourceLayer || !targetLayer) {
      return;
    }

    const sourceSlot = getCollageSlotById(sourceLayer.slotId);
    const targetSlot = getCollageSlotById(targetLayer.slotId);
    if (!sourceSlot || !targetSlot) {
      return;
    }

    const nextSourceGeometry = remapCollageGeometry(
      {
        x: sourceLayer.x,
        y: sourceLayer.y,
        width: sourceLayer.width,
        height: sourceLayer.height,
      },
      sourceSlot,
      targetSlot,
    );
    const nextTargetGeometry = remapCollageGeometry(
      {
        x: targetLayer.x,
        y: targetLayer.y,
        width: targetLayer.width,
        height: targetLayer.height,
      },
      targetSlot,
      sourceSlot,
    );

    setLayers((prevLayers) =>
      prevLayers.map((layer) => {
        if (layer.id === sourceLayerId && layer.type === 'image' && layer.kind === 'collage') {
          return {
            ...layer,
            slotId: targetSlot.id,
            rotation: 0,
            ...nextSourceGeometry,
          };
        }

        if (layer.id === targetLayerId && layer.type === 'image' && layer.kind === 'collage') {
          return {
            ...layer,
            slotId: sourceSlot.id,
            rotation: 0,
            ...nextTargetGeometry,
          };
        }

        return layer;
      }),
    );

    setSelectedLayerId(sourceLayerId);
    setDragArmedImageId(null);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
    setCollageSwapSourceLayerId(null);
  };

  useEffect(() => {
    const resize = () => {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport((current) =>
        current.width === nextViewport.width && current.height === nextViewport.height
          ? current
          : nextViewport,
      );

      const wrapper = containerRef.current;
      if (!wrapper) return;

      const wrapperBounds = wrapper.getBoundingClientRect();
      const parentBounds = wrapper.parentElement?.getBoundingClientRect();
      const isStackedWorkbench = nextViewport.width <= 1120;
      const boundedWorkbenchWidth = Math.max(
        280,
        Math.min(parentBounds?.width ?? wrapperBounds.width, nextViewport.width - 40),
      );
      let availableWidth = Math.max(280, boundedWorkbenchWidth - 24);
      let availableHeight = isStackedWorkbench
        ? stageSize.height
        : Math.max(220, nextViewport.height - wrapperBounds.top - 44);

      if (nextViewport.width <= 720) {
        if (isCanvasExpanded) {
          availableWidth = Math.max(280, nextViewport.width);
          availableHeight = Math.max(320, nextViewport.height);
          setCompactViewportPixels((current) =>
            current.width === 0 && current.height === 0 ? current : { width: 0, height: 0 },
          );
        } else {
          availableWidth = Math.max(280, nextViewport.width - 28);
          availableHeight = Math.max(240, Math.min(nextViewport.height * 0.4, 320));
          setCompactViewportPixels((current) =>
            current.width === availableWidth && current.height === availableHeight
              ? current
              : { width: availableWidth, height: availableHeight },
          );
        }
      } else {
        setCompactViewportPixels((current) =>
          current.width === 0 && current.height === 0 ? current : { width: 0, height: 0 },
        );
      }

      const widthScale = availableWidth / stageSize.width;
      const heightScale = availableHeight / stageSize.height;
      const scale =
        nextViewport.width <= 720 && isCanvasExpanded
          ? Math.min(widthScale, 1)
          : Math.min(widthScale, heightScale, 1);
      setStageScale(Math.max(0.15, scale));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [
    isCanvasExpanded,
    stageSize.width,
    stageSize.height,
  ]);

  useEffect(() => {
    if (!isPhoneViewport && isCanvasExpanded) {
      setIsCanvasExpanded(false);
    }
  }, [isCanvasExpanded, isPhoneViewport]);

  useEffect(() => {
    if (!isPhoneViewport || !isCanvasExpanded) {
      setFullscreenZoom(1);
      setFullscreenPan({ x: 0, y: 0 });
    }
  }, [isCanvasExpanded, isPhoneViewport]);

  useEffect(() => {
    if (!(isPhoneViewport && isCanvasExpanded)) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isCanvasExpanded, isPhoneViewport]);

  useEffect(() => {
    if (!(isPhoneViewport && isCanvasExpanded)) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCanvasExpanded(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isCanvasExpanded, isPhoneViewport]);

  useEffect(() => {
    (async () => {
      const restored = await readState();
      if (restored) {
        setPreset(restored.preset);
        setCompositionMode(restored.compositionMode);
        setCollageLayout(restored.collageLayout);
        setCollageSpacing(restored.collageSpacing);
        setLayers(restored.layers);
        setFonts(restored.fonts);
        setCustomTextStylePresets(restored.textStylePresets);
        setSelectedLayerId(restored.selectedLayerId);
      }
      setIsHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const snapshot: EditorPersistedState = {
      preset,
      compositionMode,
      collageLayout,
      collageSpacing,
      selectedLayerId,
      layers,
      fonts,
      textStylePresets: customTextStylePresets,
    };
    persistedStateRef.current = snapshot;
    void saveState(snapshot);
  }, [collageLayout, collageSpacing, compositionMode, customTextStylePresets, fonts, isHydrated, layers, preset, selectedLayerId]);

  useEffect(() => {
    const flushPersistedState = () => {
      const snapshot = persistedStateRef.current;
      if (!snapshot) {
        return;
      }

      void saveState(snapshot);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPersistedState();
      }
    };

    window.addEventListener('pagehide', flushPersistedState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushPersistedState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    const node = selectedLayerId ? nodeRefs.current[selectedLayerId] : null;

    if (!transformer) return;

    if (node) {
      transformer.nodes([node]);
      transformer.getLayer()?.batchDraw();
    } else {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    }
  }, [selectedLayerId, layers]);

  useEffect(() => {
    if (collageSpacing > 0) {
      lastEnabledCollageSpacingRef.current = collageSpacing;
    }
  }, [collageSpacing]);

  const updateLayer = (id: string, changes: Partial<Layer>) => {
    setLayers((prevLayers) =>
      prevLayers.map((layer) => (layer.id === id ? ({ ...layer, ...changes } as Layer) : layer)),
    );
  };

  const dismissSelectionUi = () => {
    setSelectedLayerId(null);
    setDragArmedImageId(null);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
    setCollageSwapSourceLayerId(null);
  };

  useEffect(() => {
    if (!(selectedLayer?.type === 'image' && selectedLayer.kind === 'background')) {
      return;
    }

    dismissSelectionUi();
  }, [selectedLayer]);

  const handleCanvasMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.target === event.target.getStage()) {
      dismissSelectionUi();
    }
  };

  const handleWorkbenchPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (isCanvasExpanded || event.target !== event.currentTarget) {
      return;
    }

    dismissSelectionUi();
  };

  const handleSelectLayer = (id: string) => {
    const nextLayer = layers.find((layer) => layer.id === id) || null;
    if (nextLayer?.type === 'image' && nextLayer.kind === 'background') {
      dismissSelectionUi();
      return;
    }

    if (collageSwapSourceLayerId && nextLayer?.type === 'image' && nextLayer.kind === 'collage') {
      if (nextLayer.id !== collageSwapSourceLayerId) {
        swapCollageLayers(collageSwapSourceLayerId, nextLayer.id);
        return;
      }
    } else if (collageSwapSourceLayerId) {
      setCollageSwapSourceLayerId(null);
    }

    setSelectedLayerId(id);

    if (nextLayer?.type !== 'text') {
      setIsTextToolsOpen(false);
      setEditingTextLayerId(null);
    } else if (editingTextLayerId && editingTextLayerId !== id) {
      setEditingTextLayerId(null);
    }

    if (dragArmedImageId !== id) {
      setDragArmedImageId(null);
    }
  };

  const handleTapImageLayer = (id: string) => {
    const layer = layers.find((item) => item.id === id) || null;
    if (layer?.type === 'image' && layer.kind === 'background') {
      dismissSelectionUi();
      return;
    }

    const isSameSelectedImage = selectedLayerId === id;
    setSelectedLayerId(id);
    setDragArmedImageId(isSameSelectedImage ? id : null);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
  };

  const handleArmImageDrag = (id: string) => {
    const layer = layers.find((item) => item.id === id) || null;
    if (layer?.type === 'image' && layer.kind === 'background') {
      dismissSelectionUi();
      return;
    }

    setSelectedLayerId(id);
    setDragArmedImageId(id);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
  };

  const handleToggleTextTools = () => {
    if (selectedLayer?.type !== 'text') {
      return;
    }

    setIsTextToolsOpen((current) => !current);
  };

  const handleStartEditingText = (id: string) => {
    setSelectedLayerId(id);
    setEditingTextLayerId(id);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const handleStopEditingText = () => {
    setEditingTextLayerId(null);
  };

  const handleQuickTextStyleChange = (changes: {
    fontSize?: number;
    lineHeight?: number;
    fontFamily?: string;
    color?: string;
    align?: 'left' | 'center' | 'right';
    backgroundEnabled?: boolean;
    backgroundColor?: string;
    backgroundStyle?: TextBackgroundStyle;
  }) => {
    if (selectedLayer?.type !== 'text') {
      return;
    }

    updateLayer(selectedLayer.id, {
      ...changes,
      stylePresetId: undefined,
    });
  };

  const handleSaveCurrentTextStylePreset = () => {
    if (selectedLayer?.type !== 'text') {
      return;
    }

    const matchingCustomPreset = customTextStylePresets.find((preset) =>
      doesTextStylePresetMatchLayer(preset, selectedLayer as TextLayer),
    );

    if (matchingCustomPreset) {
      updateLayer(selectedLayer.id, {
        stylePresetId: matchingCustomPreset.id,
      });
      return;
    }

    const nextPreset = createCustomTextStylePreset(
      `custom-style-${nanoid(8)}`,
      selectedLayer as TextLayer,
      getNextCustomTextStylePresetLabel(customTextStylePresets),
    );

    setCustomTextStylePresets((prev) => [nextPreset, ...prev]);
    updateLayer(selectedLayer.id, {
      stylePresetId: nextPreset.id,
    });
  };

  const readBlobAsDataUrl = (blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Не удалось прочитать данные.'));
      };
      reader.onerror = () => reject(new Error('Ошибка чтения данных.'));
      reader.readAsDataURL(blob);
    });
  };

  const createImageLayer = (
    image: HTMLImageElement,
    dataUrl: string,
    placement: {
      kind: 'background' | 'overlay' | 'collage';
      slotId?: string;
      x: number;
      y: number;
      width: number;
      height: number;
      crop?: ImageCrop;
    },
  ) => {
    return {
      id: nanoid(),
      type: 'image',
      kind: placement.kind,
      slotId: placement.slotId,
      src: dataUrl,
      image,
      naturalWidth: image.naturalWidth || image.width,
      naturalHeight: image.naturalHeight || image.height,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: 0,
      crop: placement.crop || {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    } as Layer;
  };

  const insertOverlayImageLayer = async (image: HTMLImageElement, dataUrl: string) => {
    const maxWidth = stageSize.width * 0.42;
    const maxHeight = stageSize.height * 0.42;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(72, image.width * scale);
    const height = Math.max(72, image.height * scale);
    const layer = createImageLayer(image, dataUrl, {
      kind: 'overlay',
      x: (stageSize.width - width) / 2,
      y: (stageSize.height - height) / 2,
      width,
      height,
    });

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setEditingTextLayerId(null);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const prepareImageFromDataUrl = async (dataUrl: string): Promise<PreparedImage> => ({
    id: nanoid(),
    dataUrl,
    image: await loadImage(dataUrl),
  });

  const prepareFilesAsImages = async (files: File[]) =>
    Promise.all(
      files.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        return prepareImageFromDataUrl(dataUrl);
      }),
    );

  const addPreparedImagesToCollage = (
    preparedImages: PreparedImage[],
    options: {
      preferredSlotId?: string | null;
    } = {},
  ) => {
    if (preparedImages.length === 0) {
      return 0;
    }

    let insertedCount = 0;
    let lastInsertedLayerId: string | null = null;
    let shouldWarnAboutOverflow = false;
    let nextPreferredSlotId = options.preferredSlotId ?? null;

    setLayers((prev) => {
      let nextLayers = [...prev];

      for (const preparedImage of preparedImages) {
        const targetSlotId = getNextCollageSlotId(nextLayers, nextPreferredSlotId);
        nextPreferredSlotId = null;

        if (!targetSlotId) {
          shouldWarnAboutOverflow = true;
          continue;
        }

        const nextLayer = buildCollageLayer(preparedImage, targetSlotId);
        if (!nextLayer) {
          continue;
        }

        insertedCount += 1;
        lastInsertedLayerId = nextLayer.id;
        nextLayers = [
          ...nextLayers.filter(
            (layer) => !(layer.type === 'image' && layer.kind === 'collage' && layer.slotId === targetSlotId),
          ),
          nextLayer,
        ];
      }

      return nextLayers;
    });

    if (lastInsertedLayerId) {
      setSelectedLayerId(lastInsertedLayerId);
      setEditingTextLayerId(null);
      setIsTextToolsOpen(false);
      setDragArmedImageId(null);
    }

    if (shouldWarnAboutOverflow) {
      const layoutLabel = getCollageLayoutDefinition(collageLayout).label.toLowerCase();
      window.setTimeout(() => {
        alert(`В раскладке “${layoutLabel}” пока не хватает ячеек для всех выбранных фото.`);
      }, 0);
    }

    return insertedCount;
  };

  const addImageFromBlob = async (blob: Blob, mode: ClipboardImageMode = 'background') => {
    const imageDataUrl = await readBlobAsDataUrl(blob);
    await addImageLayerFromDataUrl(imageDataUrl, mode);
  };

  const addImageFromText = async (
    text: string,
    mode: ClipboardImageMode = 'background',
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    if (trimmed.startsWith('data:image/')) {
      await addImageLayerFromDataUrl(trimmed, mode);
      return true;
    }

    const looksLikeImageUrl =
      /^(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:\?\S*)?)$/i.test(trimmed);
    if (!looksLikeImageUrl) return false;

    const response = await fetch(trimmed, { mode: 'cors' });
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return false;

    await addImageFromBlob(blob, mode);
    return true;
  };

  const handleClearCollage = () => {
    setLayers((prev) => prev.filter((layer) => !(layer.type === 'image' && layer.kind === 'collage')));
    dismissSelectionUi();
  };

  const handleResetSelectedCollageImage = () => {
    if (!(selectedLayer?.type === 'image' && selectedLayer.kind === 'collage')) {
      return;
    }

    const slot = getCollageSlotById(selectedLayer.slotId);
    if (!slot) {
      return;
    }

    const sourceSize = getImageSourceSize(selectedLayer);
    const placement = getSlotCoverPlacement(slot, sourceSize.width, sourceSize.height, {
      overscan: getDefaultCollageOverscan(collageLayout),
    });
    updateLayer(selectedLayer.id, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: 0,
    });
  };

  const handleSelectedCollageScaleChange = (nextScale: number) => {
    if (!(selectedLayer?.type === 'image' && selectedLayer.kind === 'collage')) {
      return;
    }

    const slot = getCollageSlotById(selectedLayer.slotId);
    if (!slot) {
      return;
    }

    const geometry = scaleCollageGeometry(
      slot,
      {
        x: selectedLayer.x,
        y: selectedLayer.y,
        width: selectedLayer.width,
        height: selectedLayer.height,
      },
      clamp(nextScale, 1, 3),
    );

    updateLayer(selectedLayer.id, geometry);
  };

  const handleToggleCollageSwapMode = () => {
    if (!(selectedLayer?.type === 'image' && selectedLayer.kind === 'collage')) {
      return;
    }

    setCollageSwapSourceLayerId((current) =>
      current === selectedLayer.id ? null : selectedLayer.id,
    );
    setDragArmedImageId(null);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
  };

  const finalizeMainPhotoLayer = async (
    image: HTMLImageElement,
    options: {
      presetKey: Preset;
      mode: 'fit' | 'cover';
      crop?: ImageCrop;
      zoom?: number;
    },
  ) => {
    const targetKey = options.presetKey;
    const target = getPresetByKey(targetKey);
    let width = target.width;
    let height = target.height;
    let x = 0;
    let y = 0;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const crop = options.crop || {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    if (options.mode === 'fit') {
      const fitScale =
        Math.min(target.width / sourceWidth, target.height / sourceHeight) *
        clamp(options.zoom ?? 1, 0.25, 1);
      width = sourceWidth * fitScale;
      height = sourceHeight * fitScale;
      x = (target.width - width) / 2;
      y = (target.height - height) / 2;
    }
    const persistedBackground = await rasterizeBackgroundImage({
      image,
      crop,
      width,
      height,
    });
    const layer = createImageLayer(persistedBackground.image, persistedBackground.dataUrl, {
      kind: 'background',
      x,
      y,
      width,
      height,
      crop: persistedBackground.crop,
    });

    setLayers((prev) => {
      const withoutBackgroundLayers = prev.filter(
        (currentLayer) => !(currentLayer.type === 'image' && currentLayer.kind === 'background'),
      );
      return [layer, ...withoutBackgroundLayers];
    });
    setSelectedLayerId(null);
    setEditingTextLayerId(null);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const handleRecenterBackground = () => {
    setLayers((prev) =>
      prev.map((layer) => {
        if (!(layer.type === 'image' && layer.kind === 'background')) {
          return layer;
        }

        return {
          ...layer,
          x: (stageSize.width - layer.width) / 2,
          y: (stageSize.height - layer.height) / 2,
          rotation: 0,
        };
      }),
    );
    dismissSelectionUi();
  };

  const handleRemoveBackground = () => {
    setLayers((prev) =>
      prev.filter((layer) => !(layer.type === 'image' && layer.kind === 'background')),
    );
    dismissSelectionUi();
  };

  const addImageLayerFromDataUrl = async (
    dataUrl: string,
    mode: ClipboardImageMode = 'background',
  ) => {
    if (mode === 'overlay') {
      const image = await loadImage(dataUrl);
      await insertOverlayImageLayer(image, dataUrl);
      return;
    }

    if (mode === 'collage') {
      const preparedImage = await prepareImageFromDataUrl(dataUrl);
      addPreparedImagesToCollage([preparedImage], {
        preferredSlotId:
          selectedLayer?.type === 'image' && selectedLayer.kind === 'collage'
            ? selectedLayer.slotId
            : null,
      });
      return;
    }

    const image = await loadImage(dataUrl);
    if (pendingImage) return;
    setPendingImage({ dataUrl, image });
  };

  const addImageLayer = async (file: File) => {
    if (compositionMode === 'collage') {
      const preparedImage = (await prepareFilesAsImages([file]))[0];
      if (!preparedImage) {
        return;
      }

      addPreparedImagesToCollage([preparedImage], {
        preferredSlotId:
          selectedLayer?.type === 'image' && selectedLayer.kind === 'collage'
            ? selectedLayer.slotId
            : null,
      });
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    await addImageLayerFromDataUrl(dataUrl);
  };

  const applyPendingImage = async ({
    preset: pickedPreset,
    mode,
    crop,
    zoom,
  }: {
    preset: Preset;
    mode: 'cover' | 'fit';
    crop: ImageCrop;
    zoom: number;
  }) => {
    if (!pendingImage) return;

    if (pickedPreset !== preset) {
      setPreset(pickedPreset);
    }

    await finalizeMainPhotoLayer(pendingImage.image, {
      presetKey: pickedPreset,
      mode,
      crop,
      zoom,
    });
    setPendingImage(null);
  };

  const addTextLayer = (
    value = 'Новый текст',
    options: {
      openEditor?: boolean;
      fontFamily?: string;
      fontStyle?: 'normal' | 'bold' | 'italic' | 'bold italic';
      letterSpacing?: number;
      fontSize?: number;
      lineHeight?: number;
      align?: 'left' | 'center' | 'right';
      color?: string;
      backgroundEnabled?: boolean;
      backgroundColor?: string;
      backgroundStyle?: TextBackgroundStyle;
      stylePresetId?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
    } = {},
  ) => {
    const id = nanoid();
    const layer: Layer = {
      id,
      type: 'text',
      text: value,
      fontFamily: options.fontFamily ?? defaultTextPreset?.family ?? fonts[0].family,
      fontStyle: options.fontStyle ?? defaultTextPreset?.fontStyle ?? 'bold',
      letterSpacing: options.letterSpacing ?? defaultTextPreset?.letterSpacing ?? 0,
      fontSize: options.fontSize ?? defaultTextPreset?.fontSize ?? 84,
      lineHeight: options.lineHeight ?? defaultTextPreset?.lineHeight ?? 1.2,
      align: options.align ?? defaultTextPreset?.align ?? 'left',
      color: options.color ?? defaultTextPreset?.color ?? '#241d17',
      backgroundEnabled: options.backgroundEnabled ?? false,
      backgroundColor: options.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR,
      backgroundStyle: options.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE,
      stylePresetId:
        options.stylePresetId ?? (Object.keys(options).length === 0 ? defaultTextPreset?.id : undefined),
      x: options.x ?? stageSize.width * 0.08,
      y: options.y ?? stageSize.height * 0.12,
      width: options.width ?? stageSize.width * 0.82,
      height: options.height ?? 220,
      rotation: options.rotation ?? 0,
    } as Layer;

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(id);
    setEditingTextLayerId(options.openEditor === false ? null : id);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const handleOpenSymbolPicker = () => {
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
    setIsSymbolPickerOpen(true);
  };

  const handleAddSymbol = (symbol: string) => {
    const baseSize = Math.round(Math.min(stageSize.width, stageSize.height) * 0.16);
    const width = Math.max(180, Math.round(baseSize * 1.55));
    const height = Math.max(180, Math.round(baseSize * 1.3));

    addTextLayer(symbol, {
      openEditor: false,
      fontStyle: 'bold',
      fontSize: baseSize,
      lineHeight: 1,
      align: 'center',
      color: '#241d17',
      backgroundEnabled: false,
      stylePresetId: undefined,
      x: (stageSize.width - width) / 2,
      y: (stageSize.height - height) / 2,
      width,
      height,
    });
    setIsSymbolPickerOpen(false);
  };

  const setCanvasExpandedState = (nextExpanded: boolean) => {
    setIsCanvasExpanded(nextExpanded);
    if (!nextExpanded) {
      setFullscreenZoom(1);
      setFullscreenPan({ x: 0, y: 0 });
    }
  };

  const handleCanvasPinchExpand = () => {
    if (!isPhoneViewport || isCanvasExpanded) {
      return;
    }

    setFullscreenZoom(1);
    setFullscreenPan({ x: 0, y: 0 });
    setIsCanvasExpanded(true);
  };

  const handleCanvasPinchZoom = (nextState: { zoom: number; panX: number; panY: number }) => {
    if (!(isPhoneViewport && isCanvasExpanded)) {
      return;
    }

    setFullscreenZoom(clamp(nextState.zoom, 1, 2.4));
    setFullscreenPan({
      x: nextState.panX,
      y: nextState.panY,
    });
  };

  const handleCanvasPinchCollapse = () => {
    if (!(isPhoneViewport && isCanvasExpanded)) {
      return;
    }

    setCanvasExpandedState(false);
  };

  const moveLayer = (direction: 'backward' | 'forward') => {
    if (!selectedLayerId || isSelectedCollageImage) return;

    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.id === selectedLayerId);
      if (index === -1) return prev;

      const target = direction === 'forward' ? index + 1 : index - 1;
      if (target < 0 || target >= prev.length) return prev;

      const updated = [...prev];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });
  };

  const moveSelectedLayerToEdge = (edge: 'back' | 'front') => {
    if (!selectedLayerId || isSelectedCollageImage) {
      return;
    }

    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.id === selectedLayerId);
      if (index === -1) {
        return prev;
      }

      const selected = prev[index];
      const remaining = prev.filter((layer) => layer.id !== selectedLayerId);
      return edge === 'back' ? [selected, ...remaining] : [...remaining, selected];
    });
  };

  const updateTextField = (id: string, text: string) => {
    updateLayer(id, { text });
  };

  const updateImageCrop = (id: string, axis: keyof ImageCrop, value: number) => {
    const imageLayer = layers.find((item) => item.id === id && item.type === 'image');
    if (!imageLayer || imageLayer.type !== 'image') return;

    const updates = { ...imageLayer.crop, [axis]: value };
    if (updates.width < 5) updates.width = 5;
    if (updates.height < 5) updates.height = 5;
    updates.x = clamp(updates.x, 0, 100 - updates.width);
    updates.y = clamp(updates.y, 0, 100 - updates.height);

    updateLayer(id, { crop: updates });
  };

  const getConstrainedCollageGeometry = (
    layer: Extract<Layer, { type: 'image' }>,
    geometry: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
  ) => {
    const slot = getCollageSlotById(layer.slotId);
    if (!slot) {
      return geometry;
    }

    return clampCollageImageGeometry(slot, geometry, layer.width / Math.max(layer.height, 1));
  };

  const handleTransform = (id: string, event: Konva.KonvaEventObject<Event>) => {
    const node = event.target;
    const layer = layers.find((item) => item.id === id);
    if (!layer || !(node instanceof Konva.Node)) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);

    if (layer.type === 'text') {
      const width = clamp(node.width() * scaleX, 40, stageSize.width * 3);
      const height = clamp(node.height() * scaleY, 40, stageSize.height * 3);
      updateLayer(id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width,
        height,
      });
      return;
    }

    const width = clamp(node.width() * scaleX, 24, stageSize.width * 3);
    const height = clamp(node.height() * scaleY, 24, stageSize.height * 3);
    if (layer.kind === 'collage') {
      const geometry = getConstrainedCollageGeometry(layer, {
        x: node.x(),
        y: node.y(),
        width,
        height,
      });

      updateLayer(id, {
        x: geometry.x,
        y: geometry.y,
        rotation: 0,
        width: geometry.width,
        height: geometry.height,
      });
      return;
    }

    updateLayer(id, {
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width,
      height,
    });
  };

  const handleDragEnd = (id: string, event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target;
    if (!(node instanceof Konva.Node)) return;

    const layer = layers.find((item) => item.id === id);
    if (layer?.type === 'image' && layer.kind === 'collage') {
      const geometry = getConstrainedCollageGeometry(layer, {
        x: node.x(),
        y: node.y(),
        width: layer.width,
        height: layer.height,
      });

      updateLayer(id, {
        x: geometry.x,
        y: geometry.y,
      });
      setDragArmedImageId(null);
      return;
    }

    updateLayer(id, {
      x: node.x(),
      y: node.y(),
    });

    if (layer?.type === 'image') {
      setDragArmedImageId(null);
    }
  };

  const handleRestoreLayerGeometry = (
    id: string,
    geometry: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  ) => {
    updateLayer(id, geometry);
  };

  const handleExport = async () => {
    const stage = stageRef.current;
    if (!stage) return;

    const fileName = `${preset}-${Date.now()}.png`;
    const dataUrl = stage.toDataURL({
      x: canvasWorkspace.offsetX,
      y: canvasWorkspace.offsetY,
      width: stageSize.width,
      height: stageSize.height,
      pixelRatio: 3,
      mimeType: 'image/png',
    });
    const blob = await dataUrlToBlob(dataUrl);
    const exportFile = new File([blob], fileName, { type: 'image/png' });

    try {
      const canShareFiles =
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [exportFile] }));

      if (canShareFiles) {
        await navigator.share({
          files: [exportFile],
          title: fileName,
        });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  const closeSavePreview = () => {
    setSavePreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  };

  useEffect(() => {
    const resetTransientEditorUi = () => {
      setIsPreparingSavePreview(false);
      setDragArmedImageId(null);
      setIsTextToolsOpen(false);
      setEditingTextLayerId(null);
      closeSavePreview();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetTransientEditorUi();
      }
    };

    window.addEventListener('focus', resetTransientEditorUi);
    window.addEventListener('pageshow', resetTransientEditorUi);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', resetTransientEditorUi);
      window.removeEventListener('pageshow', resetTransientEditorUi);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleRequestSavePreview = async () => {
    const stage = stageRef.current;
    if (!stage || isPreparingSavePreview || layers.length === 0) {
      return;
    }

    setIsPreparingSavePreview(true);
    try {
      const dataUrl = stage.toDataURL({
        x: canvasWorkspace.offsetX,
        y: canvasWorkspace.offsetY,
        width: stageSize.width,
        height: stageSize.height,
        pixelRatio: 3,
        mimeType: 'image/png',
      });
      const blob = await dataUrlToBlob(dataUrl);
      const previewUrl = URL.createObjectURL(blob);
      setSavePreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return previewUrl;
      });
    } finally {
      setIsPreparingSavePreview(false);
    }
  };

  const handlePresetChange = (nextPreset: Preset) => {
    if (nextPreset === preset) {
      return;
    }

    if (compositionMode === 'collage' && collageLayers.length > 0) {
      const nextStageSize = getPresetByKey(nextPreset);
      const nextSlots = getCollageSlots(
        collageLayout,
        nextStageSize.width,
        nextStageSize.height,
        collageSpacing,
      );
      setLayers((prev) => remapCollageLayers(prev, collageSlots, nextSlots));
    }

    setPreset(nextPreset);
  };

  const openFormatPicker = () => {
    setDraftPreset(preset);
    setDraftCompositionMode(compositionMode);
    setDraftCollageLayout(collageLayout);
    setIsFormatPickerOpen(true);
  };

  const closeFormatPicker = () => {
    setIsFormatPickerOpen(false);
  };

  const handleApplyFormatPicker = () => {
    const nextPreset = draftPreset;
    const nextMode = draftCompositionMode;
    const nextLayout = draftCollageLayout;
    const nextSpacing = collageSpacing;
    const hasSinglePhoto = layers.some(
      (layer) => layer.type === 'image' && layer.kind === 'background',
    );
    const hasCollagePhoto = collageLayers.length > 0;
    const shouldRemapCollage =
      compositionMode === 'collage' &&
      nextMode === 'collage' &&
      collageLayers.length > 0 &&
      (nextPreset !== preset || nextLayout !== collageLayout || nextSpacing !== collageSpacing);

    let shouldClearBackground = false;
    let shouldClearCollage = false;

    if (nextMode !== compositionMode) {
      if (nextMode === 'collage' && hasSinglePhoto) {
        const shouldSwitch = window.confirm(
          'Переключиться на коллаж? Текущее фоновое фото уйдёт, а текст и стикеры останутся.',
        );
        if (!shouldSwitch) {
          return;
        }

        shouldClearBackground = true;
      }

      if (nextMode === 'single' && hasCollagePhoto) {
        const shouldSwitch = window.confirm(
          'Вернуться к одиночному фото? Коллажные кадры очистятся, а текст и стикеры останутся.',
        );
        if (!shouldSwitch) {
          return;
        }

        shouldClearCollage = true;
      }
    }

    let nextSlots: ReturnType<typeof getCollageSlots> | null = null;
    if (nextMode === 'collage') {
      const nextStageSize = getPresetByKey(nextPreset);
      nextSlots = getCollageSlots(nextLayout, nextStageSize.width, nextStageSize.height, nextSpacing);
    }

    if (shouldRemapCollage && nextSlots) {
      const extraImages = Math.max(0, collageLayers.length - nextSlots.length);
      if (extraImages > 0) {
        const shouldSwitch = window.confirm(
          `В новой раскладке меньше ячеек. Лишние фото (${extraImages}) будут скрыты. Продолжить?`,
        );
        if (!shouldSwitch) {
          return;
        }
      }
    }

    if (shouldClearBackground || shouldClearCollage || shouldRemapCollage) {
      setLayers((prevLayers) => {
        let nextLayers = prevLayers;

        if (shouldClearBackground) {
          nextLayers = nextLayers.filter(
            (layer) => !(layer.type === 'image' && layer.kind === 'background'),
          );
        }

        if (shouldClearCollage) {
          nextLayers = nextLayers.filter(
            (layer) => !(layer.type === 'image' && layer.kind === 'collage'),
          );
        }

        if (shouldRemapCollage && nextSlots) {
          nextLayers = remapCollageLayers(nextLayers, collageSlots, nextSlots);
        }

        return nextLayers;
      });
    }

    setPendingImage(null);
    setPreset(nextPreset);
    setCompositionMode(nextMode);
    setCollageLayout(nextLayout);
    setCollageSpacing(nextSpacing);
    dismissSelectionUi();
    setIsFormatPickerOpen(false);
  };

  const handleCompositionModeChange = (nextMode: CompositionMode) => {
    if (nextMode === compositionMode) {
      return;
    }

    const hasSinglePhoto = layers.some(
      (layer) => layer.type === 'image' && layer.kind === 'background',
    );
    const hasCollagePhoto = layers.some(
      (layer) => layer.type === 'image' && layer.kind === 'collage',
    );

    if (nextMode === 'collage' && hasSinglePhoto) {
      const shouldSwitch = window.confirm(
        'Переключиться на коллаж? Текущее фоновое фото уйдёт, а текст и стикеры останутся.',
      );
      if (!shouldSwitch) {
        return;
      }

      setLayers((prev) =>
        prev.filter((layer) => !(layer.type === 'image' && layer.kind === 'background')),
      );
    }

    if (nextMode === 'single' && hasCollagePhoto) {
      const shouldSwitch = window.confirm(
        'Вернуться к одиночному фото? Коллажные кадры очистятся, а текст и стикеры останутся.',
      );
      if (!shouldSwitch) {
        return;
      }

      setLayers((prev) =>
        prev.filter((layer) => !(layer.type === 'image' && layer.kind === 'collage')),
      );
    }

    setPendingImage(null);
    setCompositionMode(nextMode);
    dismissSelectionUi();
  };

  const handleCollageLayoutChange = (nextLayout: CollageLayout) => {
    if (nextLayout === collageLayout) {
      return;
    }

    const nextSlots = getCollageSlots(nextLayout, stageSize.width, stageSize.height, collageSpacing);
    const extraImages = Math.max(0, collageLayers.length - nextSlots.length);
    if (extraImages > 0) {
      const shouldSwitch = window.confirm(
        `В новой раскладке меньше ячеек. Лишние фото (${extraImages}) будут скрыты. Продолжить?`,
      );
      if (!shouldSwitch) {
        return;
      }
    }

    if (collageLayers.length > 0) {
      setLayers((prev) => remapCollageLayers(prev, collageSlots, nextSlots));
    }

    setCollageLayout(nextLayout);
    dismissSelectionUi();
  };

  const handleCollageSpacingChange = (nextSpacing: number) => {
    const clampedSpacing = Math.min(COLLAGE_MAX_SPACING, Math.max(COLLAGE_MIN_SPACING, Math.round(nextSpacing)));
    if (clampedSpacing === collageSpacing) {
      return;
    }

    if (clampedSpacing > 0) {
      lastEnabledCollageSpacingRef.current = clampedSpacing;
    }

    const nextSlots = getCollageSlots(collageLayout, stageSize.width, stageSize.height, clampedSpacing);
    if (collageLayers.length > 0) {
      setLayers((prev) => remapCollageLayers(prev, collageSlots, nextSlots));
    }

    setCollageSpacing(clampedSpacing);
  };

  const handleToggleCollageSpacing = (enabled: boolean) => {
    if (enabled) {
      const restoredSpacing =
        lastEnabledCollageSpacingRef.current > 0
          ? lastEnabledCollageSpacingRef.current
          : getDefaultCollageSpacing(stageSize.width, stageSize.height);
      handleCollageSpacingChange(restoredSpacing);
      return;
    }

    if (collageSpacing > 0) {
      lastEnabledCollageSpacingRef.current = collageSpacing;
    }
    handleCollageSpacingChange(0);
  };

  const handleCanvasDrop = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      return;
    }

    if (compositionMode === 'collage') {
      const preparedImages = await prepareFilesAsImages(imageFiles);
      addPreparedImagesToCollage(preparedImages, {
        preferredSlotId:
          selectedLayer?.type === 'image' && selectedLayer.kind === 'collage'
            ? selectedLayer.slotId
            : null,
      });
      return;
    }

    for (const file of imageFiles) {
      if (pendingImage) return;
      await addImageLayer(file);
    }
  };

  const removeSelectedLayer = () => {
    if (!selectedLayerId) return;
    setLayers((prev) => prev.filter((layer) => layer.id !== selectedLayerId));
    setSelectedLayerId(null);
    setDragArmedImageId(null);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
  };

  useEffect(() => {
    if (!dragArmedImageId) return;

    const armedLayer = layers.find((layer) => layer.id === dragArmedImageId);
    if (
      !armedLayer ||
      armedLayer.type !== 'image' ||
      armedLayer.kind === 'overlay' ||
      selectedLayerId !== dragArmedImageId
    ) {
      setDragArmedImageId(null);
    }
  }, [dragArmedImageId, layers, selectedLayerId]);

  useEffect(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      setIsTextToolsOpen(false);
      setEditingTextLayerId(null);
      return;
    }

    if (editingTextLayerId && editingTextLayerId !== selectedLayer.id) {
      setEditingTextLayerId(null);
    }
  }, [editingTextLayerId, selectedLayer]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      );
    };

    const handleDeleteFromKeyboard = (event: KeyboardEvent) => {
      if (!(event.key === 'Backspace' || event.key === 'Delete')) return;
      if (!selectedLayerId) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      removeSelectedLayer();
    };

    window.addEventListener('keydown', handleDeleteFromKeyboard);
    return () => window.removeEventListener('keydown', handleDeleteFromKeyboard);
  }, [removeSelectedLayer, selectedLayerId]);

  const addTextToSelectionOrNewLayer = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (selectedLayer?.type === 'text') {
      updateTextField(selectedLayer.id, `${selectedLayer.text}\n${text}`);
      return;
    }

    addTextLayer(trimmed);
  };

  const parseClipboardTextAsImage = async (
    text: string,
    mode: ClipboardImageMode = 'background',
  ) => {
    const insertedAsImage = await addImageFromText(text, mode);
    if (insertedAsImage) return;
    await addTextToSelectionOrNewLayer(text);
  };

  const parseClipboardHtmlAsImage = async (
    html: string,
    mode: ClipboardImageMode = 'background',
  ) => {
    const imageFromTag = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(html)?.[1];
    if (!imageFromTag) {
      return false;
    }

    return addImageFromText(imageFromTag, mode);
  };

  const handlePasteFromClipboard = async () => {
    if (pendingImage) return;

    if (!window.isSecureContext) {
      alert('Кнопка “Вставить” работает только в защищённом режиме HTTPS или на localhost.');
      return;
    }

    if (!navigator.clipboard) {
      alert('Этот браузер не даёт доступ к буферу обмена. Попробуйте системную вставку или Safari.');
      return;
    }

    try {
      if (typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();

        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            await addImageFromBlob(blob, 'overlay');
            return;
          }

          if (item.types.includes('text/html')) {
            const html = await (await item.getType('text/html')).text();
            if (await parseClipboardHtmlAsImage(html, 'overlay')) {
              return;
            }
          }

          if (item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text();
            if (text.trim()) {
              await parseClipboardTextAsImage(text, 'overlay');
              return;
            }
          }
        }
      }

      if (typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          await parseClipboardTextAsImage(text, 'overlay');
          return;
        }
      }

      alert('В буфере не нашлось картинки, стикера или текста для вставки.');
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (
        message.includes('notallowed') ||
        message.includes('permission') ||
        message.includes('denied')
      ) {
        alert('Safari не дал доступ к буферу. Нажмите “Вставить” ещё раз и подтвердите системную вставку.');
        return;
      }

      alert('Не удалось прочитать буфер обмена.');
    }
  };

  useEffect(() => {
    const handleWindowPaste = async (event: ClipboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      const data = event.clipboardData;
      if (!data) return;

      const items = Array.from(data.items);
      const imageItem = items.find(
        (item) => item.kind === 'file' && typeof item.type === 'string' && item.type.startsWith('image/'),
      );

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          event.preventDefault();
          if (pendingImage) return;
          await addImageFromBlob(file, compositionMode === 'collage' ? 'collage' : 'background');
          return;
        }
      }

      const html = data.getData('text/html');
      if (html) {
        if (
          await parseClipboardHtmlAsImage(html, compositionMode === 'collage' ? 'collage' : 'background')
        ) {
          event.preventDefault();
          return;
        }
      }

      const text = data.getData('text/plain');
      if (text && text.trim()) {
        event.preventDefault();
        await parseClipboardTextAsImage(text, compositionMode === 'collage' ? 'collage' : 'background');
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [
    addImageFromBlob,
    addImageFromText,
    compositionMode,
    parseClipboardHtmlAsImage,
    parseClipboardTextAsImage,
  ]);

  const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    if (compositionMode === 'collage') {
      const preparedImages = await prepareFilesAsImages(files);
      addPreparedImagesToCollage(preparedImages, {
        preferredSlotId:
          selectedLayer?.type === 'image' && selectedLayer.kind === 'collage'
            ? selectedLayer.slotId
            : null,
      });
      event.target.value = '';
      return;
    }

    const file = files[0];
    if (pendingImage) {
      event.target.value = '';
      return;
    }
    await addImageLayer(file);
    event.target.value = '';
  };

  const handleUploadFont = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.ttf')) {
      alert('Поддерживаются только .ttf');
      return;
    }

    const buffer = await file.arrayBuffer();
    const dataUrl = await readFileAsDataUrl(file);
    const family = `custom-${nanoid()}`;
    const font = new FontFace(family, buffer);

    await font.load();
    document.fonts.add(font);
    setFonts((prev) => [...prev, { id: family, name: file.name, family, dataUrl }]);
    event.target.value = '';
  };

  const handleDeleteUploadedFont = (fontId: string) => {
    const fontToDelete = fonts.find((font) => font.id === fontId && font.id !== 'default');
    if (!fontToDelete) {
      return;
    }

    const affectedLayers = layers.filter(
      (layer) => layer.type === 'text' && layer.fontFamily === fontToDelete.family,
    ).length;
    const confirmationText =
      affectedLayers > 0
        ? `Удалить шрифт "${fontToDelete.name}" с этого устройства? Он исчезнет из списка, а ${affectedLayers} текстовых слоёв переключатся на System Sans.`
        : `Удалить шрифт "${fontToDelete.name}" с этого устройства? Потом его можно будет импортировать заново.`;

    if (!window.confirm(confirmationText)) {
      return;
    }

    try {
      const fontSet = document.fonts;
      if (Symbol.iterator in fontSet) {
        for (const face of fontSet as unknown as Iterable<FontFace>) {
          if (face.family === fontToDelete.family) {
            fontSet.delete(face);
          }
        }
      }
    } catch {
      // ignore font set cleanup failures
    }

    setFonts((prev) => prev.filter((font) => font.id !== fontToDelete.id));
    setCustomTextStylePresets((prev) =>
      prev.map((preset) =>
        preset.family === fontToDelete.family
          ? {
              ...preset,
              family: DEFAULT_FONT.family,
            }
          : preset,
      ),
    );
    setLayers((prev) =>
      prev.map((layer) =>
        layer.type === 'text' && layer.fontFamily === fontToDelete.family
          ? {
              ...layer,
              fontFamily: DEFAULT_FONT.family,
              stylePresetId: undefined,
            }
          : layer,
      ),
    );
  };

  const collageProgressLabel =
    compositionMode === 'collage' ? `${collageLayers.length}/${collageSlots.length} фото` : null;
  const primaryImageActionLabel =
    compositionMode === 'collage'
      ? selectedLayer?.type === 'image' && selectedLayer.kind === 'collage'
        ? 'Заменить'
        : `Фото ${collageLayers.length}/${collageSlots.length}`
      : hasBackgroundLayer
        ? 'Сменить фон'
        : 'Добавить фон';
  const secondaryImageActionLabel =
    compositionMode === 'collage' ? 'Очистить' : 'Убрать фон';
  const utilityImageActionLabel =
    compositionMode === 'collage' ? 'В центр' : 'Фон в центр';
  const isSecondaryImageActionDisabled =
    compositionMode === 'collage' ? collageLayers.length === 0 : !hasBackgroundLayer;
  const isUtilityImageActionDisabled =
    compositionMode === 'collage'
      ? !(selectedLayer?.type === 'image' && selectedLayer.kind === 'collage')
      : !hasBackgroundLayer;
  const collageSpacingLabel =
    collageSpacing === 0 ? 'Без полей' : `${collageSpacing}px`;
  const isCollageSpacingEnabled = collageSpacing > 0;
  const collageSwapButtonLabel =
    isCollageSwapMode ? 'Отменить обмен' : 'Поменять местами';
  const collageSwapHelpText = isCollageSwapMode
    ? 'Теперь нажми на другую фотку в коллаже, и кадры поменяются местами.'
    : 'Если захочешь переставить кадры, включи обмен и тапни вторую фотку.';
  const formatSummary =
    compositionMode === 'collage'
      ? `${preset === 'story' ? '9:16' : '4:5'} · Коллаж · ${collageLayoutDefinition.label}`
      : `${preset === 'story' ? '9:16' : '4:5'} · Одна фотография`;

  return (
    <div className="app">
      <TopBar
        selectedLayerType={selectedLayer?.type ?? null}
      />

      <main className="workbench" onPointerDown={handleWorkbenchPointerDown}>
        <Suspense
          fallback={
            pendingImage ? (
              <div className="modal-backdrop" role="presentation">
                <section
                  aria-label="Image picker"
                  aria-modal="true"
                  className="image-picker image-picker--loading"
                  role="dialog"
                >
                  <div className="image-picker-head">
                    <div>
                      <h2>Подгонка фото</h2>
                      <p>Готовим инструмент загрузки и кадрирования...</p>
                    </div>
                  </div>
                </section>
              </div>
            ) : null
          }
        >
          <LazyImagePicker
            open={Boolean(pendingImage)}
            image={
              pendingImage
                ? { src: pendingImage.dataUrl, width: pendingImage.image.width, height: pendingImage.image.height }
                : { src: '', width: 1, height: 1 }
            }
            presets={PRESETS}
            initialPreset={preset}
            onApply={applyPendingImage}
            onCancel={() => setPendingImage(null)}
          />
        </Suspense>

        <SymbolPicker
          open={isSymbolPickerOpen}
          onClose={() => setIsSymbolPickerOpen(false)}
          onPick={handleAddSymbol}
        />

        <FormatPicker
          open={isFormatPickerOpen}
          preset={draftPreset}
          compositionMode={draftCompositionMode}
          collageLayout={draftCollageLayout}
          onPresetChange={setDraftPreset}
          onCompositionModeChange={setDraftCompositionMode}
          onCollageLayoutChange={setDraftCollageLayout}
          onClose={closeFormatPicker}
          onApply={handleApplyFormatPicker}
        />

        <ActionRail
          onPrimaryImageAction={() => imageInputRef.current?.click()}
          primaryImageLabel={primaryImageActionLabel}
          onSecondaryImageAction={compositionMode === 'collage' ? handleClearCollage : handleRemoveBackground}
          secondaryImageLabel={secondaryImageActionLabel}
          isSecondaryImageActionDisabled={isSecondaryImageActionDisabled}
          onPaste={handlePasteFromClipboard}
          onAddText={addTextLayer}
          onAddSymbol={handleOpenSymbolPicker}
          onUploadFont={() => fontInputRef.current?.click()}
          onUtilityImageAction={
            compositionMode === 'collage' ? handleResetSelectedCollageImage : handleRecenterBackground
          }
          utilityImageLabel={utilityImageActionLabel}
          isUtilityImageActionDisabled={isUtilityImageActionDisabled}
          onDeleteSelected={removeSelectedLayer}
          onExport={handleExport}
          isDeleteDisabled={!selectedLayer}
          isExportDisabled={layers.length === 0}
        />

        <section
          className={`canvas-column${isPhoneViewport && !isCanvasExpanded ? ' canvas-column--compact' : ''}${
            isPhoneViewport && isCanvasExpanded ? ' canvas-column--expanded' : ''
          }`}
        >
          {!isPhoneViewport || !isCanvasExpanded ? (
            <div className="canvas-toolbar">
              {!isCanvasExpanded ? (
                <>
                  <div className="format-picker-trigger">
                    <button
                      type="button"
                      className="secondary format-picker-trigger-button"
                      onClick={openFormatPicker}
                    >
                      Выбрать формат
                    </button>
                    <p className="format-picker-trigger-summary">{formatSummary}</p>
                  </div>

                  {compositionMode === 'collage' ? (
                    <div className="collage-spacing-inline-control">
                      <div className="collage-spacing-inline-head">
                        <div>
                          <span>Поля коллажа</span>
                          <strong>{collageSpacingLabel}</strong>
                        </div>
                        <label className="collage-spacing-inline-toggle">
                          <input
                            type="checkbox"
                            checked={isCollageSpacingEnabled}
                            onChange={(event) => handleToggleCollageSpacing(event.target.checked)}
                          />
                          <span>Вкл</span>
                        </label>
                      </div>
                      <input
                        type="range"
                        min={COLLAGE_MIN_SPACING}
                        max={COLLAGE_MAX_SPACING}
                        value={collageSpacing}
                        disabled={!isCollageSpacingEnabled}
                        onChange={(event) => handleCollageSpacingChange(Number(event.target.value))}
                        aria-label="Ширина полей коллажа"
                      />
                      <div className="collage-spacing-inline-scale" aria-hidden="true">
                        <span>Меньше</span>
                        <span>Больше</span>
                      </div>
                    </div>
                  ) : null}

                  {compositionMode === 'collage' ? (
                    <p className="canvas-toolbar-note">
                      {isCollageSwapMode
                        ? collageSwapHelpText
                        : isCollageReady
                        ? `Коллаж собран: ${collageProgressLabel}. Поля сейчас ${collageSpacingLabel.toLowerCase()}, а кадры можно спокойно двигать внутри ячеек.`
                        : `${collageLayoutDefinition.label}: ${collageProgressLabel}. Добавляй фото по порядку, выделяй ячейку для замены и подстрой ширину полей как тебе нравится.`}
                    </p>
                  ) : null}
                </>
              ) : null}

              {isPhoneViewport ? (
                <button
                  type="button"
                  className={isCanvasExpanded ? 'secondary canvas-expand-button' : 'ghost canvas-expand-button'}
                  onClick={() => setCanvasExpandedState(!isCanvasExpanded)}
                >
                  {isCanvasExpanded ? 'Свернуть' : 'Развернуть'}
                </button>
              ) : null}
            </div>
          ) : null}

          {isPhoneViewport && isCanvasExpanded ? (
            <>
              <div className="fullscreen-canvas-controls">
                <button
                  type="button"
                  className="secondary canvas-expand-button"
                  onClick={() => setCanvasExpandedState(false)}
                >
                  Свернуть
                </button>
              </div>

              {isSelectedCollageImage && selectedCollageScale !== null ? (
                <div className="fullscreen-collage-scale-control">
                  <div className="fullscreen-collage-scale-head">
                    <span>Масштаб кадра</span>
                    <strong>{Math.round(selectedCollageScale * 100)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="300"
                    step="1"
                    value={Math.round(selectedCollageScale * 100)}
                    onChange={(event) =>
                      handleSelectedCollageScaleChange(Number(event.target.value) / 100)
                    }
                    aria-label="Масштаб выбранного кадра коллажа"
                  />
                  <button
                    type="button"
                    className={
                      isCollageSwapMode
                        ? 'active fullscreen-collage-swap-button'
                        : 'ghost fullscreen-collage-swap-button'
                    }
                    onClick={handleToggleCollageSwapMode}
                  >
                    {collageSwapButtonLabel}
                  </button>
                  <p className="fullscreen-collage-swap-copy">{collageSwapHelpText}</p>
                </div>
              ) : null}
            </>
          ) : null}

          <EditorCanvas
            containerRef={containerRef}
            stageRef={stageRef}
            layers={layers}
            width={stageSize.width}
            height={stageSize.height}
            stageViewportWidth={canvasWorkspace.viewportWidth}
            stageViewportHeight={canvasWorkspace.viewportHeight}
            canvasOffsetX={canvasWorkspace.offsetX}
            canvasOffsetY={canvasWorkspace.offsetY}
            scale={stageScale}
            selectedLayer={selectedLayer}
            compositionMode={compositionMode}
            collageSlots={collageSlots}
            filledCollageSlotIds={Array.from(filledCollageSlotIds)}
            isCompactPreview={isPhoneViewport && !isCanvasExpanded}
            isFullscreenCanvas={isPhoneViewport && isCanvasExpanded}
            fullscreenZoom={fullscreenZoom}
            fullscreenPan={fullscreenPan}
            dragArmedImageId={dragArmedImageId}
            isTextToolsOpen={isTextToolsOpen}
            editingTextLayerId={editingTextLayerId}
            fontOptions={fontOptions}
            uploadedFonts={fonts}
            onCanvasMouseDown={handleCanvasMouseDown}
            onSelectLayer={handleSelectLayer}
            onTapImageLayer={handleTapImageLayer}
            onArmImageDrag={handleArmImageDrag}
            onToggleTextTools={handleToggleTextTools}
            onQuickTextStyleChange={handleQuickTextStyleChange}
            onMoveSelectedLayerToEdge={moveSelectedLayerToEdge}
            canSendSelectedLayerToBack={canSendSelectedLayerToBack}
            canBringSelectedLayerToFront={canBringSelectedLayerToFront}
            onDeleteUploadedFont={handleDeleteUploadedFont}
            onDeleteSelected={removeSelectedLayer}
            onRequestSavePreview={handleRequestSavePreview}
            isPreparingSavePreview={isPreparingSavePreview}
            isSavePreviewOpen={Boolean(savePreviewUrl)}
            onPinchExpand={handleCanvasPinchExpand}
            onPinchZoom={handleCanvasPinchZoom}
            onPinchCollapse={handleCanvasPinchCollapse}
            onStartEditingText={handleStartEditingText}
            onStopEditingText={handleStopEditingText}
            onInlineTextChange={updateTextField}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onRestoreLayerGeometry={handleRestoreLayerGeometry}
            onDropFiles={handleCanvasDrop}
            onDismissWorkspaceUi={dismissSelectionUi}
            transformerRef={transformerRef}
            nodeRefs={nodeRefs}
          />
        </section>

        <PropertiesPanel
          selectedLayer={selectedLayer}
          isFirst={Boolean(selectedLayer && layers[0]?.id === selectedLayer.id)}
          isLast={Boolean(selectedLayer && layers[layers.length - 1]?.id === selectedLayer.id)}
          onMoveLayer={moveLayer}
          onChange={updateLayer}
          collageScale={selectedCollageScale}
          onCollageScaleChange={handleSelectedCollageScaleChange}
          isCollageSwapMode={isCollageSwapMode}
          onToggleCollageSwap={handleToggleCollageSwapMode}
          onTextChange={updateTextField}
          fonts={fonts}
          textStylePresets={textStylePresets}
          onSaveTextStylePreset={handleSaveCurrentTextStylePreset}
          onDeleteUploadedFont={handleDeleteUploadedFont}
        />
      </main>

      {savePreviewUrl ? (
        <div className="save-preview" role="dialog" aria-modal="true" aria-label="Сохранение изображения">
          <button type="button" className="secondary save-preview-close" onClick={closeSavePreview}>
            Закрыть
          </button>
          <div className="save-preview-card">
            <p className="save-preview-copy">
              Удерживай изображение и выбирай “Сохранить изображение” в меню iPhone.
            </p>
            <img
              src={savePreviewUrl}
              alt="Готовое изображение для сохранения"
              className="save-preview-image"
            />
          </div>
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple={compositionMode === 'collage'}
        onChange={handleUploadImage}
        hidden
      />
      <input
        ref={fontInputRef}
        type="file"
        accept=".ttf"
        onChange={handleUploadFont}
        hidden
      />
    </div>
  );
}

export default App;
