import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { nanoid } from 'nanoid';

import { TopBar } from './components/TopBar';
import { ActionRail } from './components/ActionRail';
import { ImagePicker } from './components/ImagePicker';
import { EditorCanvas } from './components/EditorCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import {
  DEFAULT_FONT,
  ImageCrop,
  Layer,
  TextBackgroundStyle,
  TextLayer,
  UploadedFont,
  Preset,
  PRESETS,
} from './editor/types';
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

function getPresetByKey(preset: Preset) {
  return PRESETS.find((item) => item.key === preset)!;
}

type ClipboardImageMode = 'background' | 'overlay';

type CanvasWorkspace = {
  viewportWidth: number;
  viewportHeight: number;
  offsetX: number;
  offsetY: number;
};

function getCanvasWorkspace({
  width,
  height,
  layers,
  includeFields,
}: {
  width: number;
  height: number;
  layers: Layer[];
  includeFields: boolean;
}): CanvasWorkspace {
  if (!includeFields) {
    return {
      viewportWidth: width,
      viewportHeight: height,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const fieldPadding = Math.round(Math.min(width, height) * 0.08);
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = height;

  for (const layer of layers) {
    minX = Math.min(minX, layer.x);
    minY = Math.min(minY, layer.y);
    maxX = Math.max(maxX, layer.x + layer.width);
    maxY = Math.max(maxY, layer.y + layer.height);
  }

  const overflowLeft = Math.max(0, -minX);
  const overflowTop = Math.max(0, -minY);
  const overflowRight = Math.max(0, maxX - width);
  const overflowBottom = Math.max(0, maxY - height);

  return {
    viewportWidth: width + fieldPadding * 2 + overflowLeft + overflowRight,
    viewportHeight: height + fieldPadding * 2 + overflowTop + overflowBottom,
    offsetX: fieldPadding + overflowLeft,
    offsetY: fieldPadding + overflowTop,
  };
}

function App() {
  const [preset, setPreset] = useState<Preset>('story');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [dragArmedImageId, setDragArmedImageId] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false);
  const [isTextToolsOpen, setIsTextToolsOpen] = useState(false);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<UploadedFont[]>([DEFAULT_FONT]);
  const [customTextStylePresets, setCustomTextStylePresets] = useState<TextStylePreset[]>([]);
  const [stageScale, setStageScale] = useState(1);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    image: HTMLImageElement;
  } | null>(null);
  const [savePreviewUrl, setSavePreviewUrl] = useState<string | null>(null);
  const [isPreparingSavePreview, setIsPreparingSavePreview] = useState(false);

  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const persistedStateRef = useRef<EditorPersistedState | null>(null);
  const defaultTextPreset = getTextStylePresetById(DEFAULT_TEXT_STYLE_PRESET_ID, customTextStylePresets);

  const stageSize = useMemo(() => getPresetByKey(preset), [preset]);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );
  const selectedLayerIndex = useMemo(
    () => (selectedLayerId ? layers.findIndex((layer) => layer.id === selectedLayerId) : -1),
    [layers, selectedLayerId],
  );
  const canSendSelectedLayerToBack = selectedLayerIndex > 0;
  const canBringSelectedLayerToFront =
    selectedLayerIndex !== -1 && selectedLayerIndex < layers.length - 1;
  const isPhoneViewport = viewport.width <= 720;
  const canvasWorkspace = useMemo(
    () =>
      getCanvasWorkspace({
        width: stageSize.width,
        height: stageSize.height,
        layers,
        includeFields: isPhoneViewport && !isCanvasExpanded,
      }),
    [isCanvasExpanded, isPhoneViewport, layers, stageSize.height, stageSize.width],
  );
  const effectiveStageScale =
    isPhoneViewport && isCanvasExpanded ? stageScale * fullscreenZoom : stageScale;
  const fontOptions = useMemo(() => getFontOptions(fonts), [fonts]);
  const textStylePresets = useMemo(
    () => getAvailableTextStylePresets(customTextStylePresets),
    [customTextStylePresets],
  );

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
      const isStackedWorkbench = nextViewport.width <= 1120;
      let availableWidth = Math.max(280, wrapper.clientWidth - 24);
      let availableHeight = isStackedWorkbench
        ? stageSize.height
        : Math.max(220, nextViewport.height - wrapperBounds.top - 44);
      const previewWidth =
        nextViewport.width <= 720 && !isCanvasExpanded
          ? canvasWorkspace.viewportWidth
          : stageSize.width;
      const previewHeight =
        nextViewport.width <= 720 && !isCanvasExpanded
          ? canvasWorkspace.viewportHeight
          : stageSize.height;

      if (nextViewport.width <= 720) {
        if (isCanvasExpanded) {
          availableWidth = Math.max(280, nextViewport.width);
          availableHeight = Math.max(320, nextViewport.height);
        } else {
          availableHeight = Math.max(240, Math.min(nextViewport.height * 0.4, 320));
        }
      }

      const widthScale = availableWidth / previewWidth;
      const heightScale = availableHeight / previewHeight;
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
    canvasWorkspace.viewportHeight,
    canvasWorkspace.viewportWidth,
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
      selectedLayerId,
      layers,
      fonts,
      textStylePresets: customTextStylePresets,
    };
    persistedStateRef.current = snapshot;
    void saveState(snapshot);
  }, [customTextStylePresets, fonts, isHydrated, layers, preset, selectedLayerId]);

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
  };

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
    const isSameSelectedImage = selectedLayerId === id;
    setSelectedLayerId(id);
    setDragArmedImageId(isSameSelectedImage ? id : null);
    setIsTextToolsOpen(false);
    setEditingTextLayerId(null);
  };

  const handleArmImageDrag = (id: string) => {
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
      kind: 'background' | 'overlay';
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

  const finalizeMainPhotoLayer = async (
    image: HTMLImageElement,
    options: {
      presetKey: Preset;
      mode: 'fit' | 'cover';
      crop?: ImageCrop;
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
      const fitScale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
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

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setEditingTextLayerId(null);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const addImageLayerFromDataUrl = async (
    dataUrl: string,
    mode: ClipboardImageMode = 'background',
  ) => {
    const image = await loadImage(dataUrl);
    if (mode === 'overlay') {
      await insertOverlayImageLayer(image, dataUrl);
      return;
    }

    if (pendingImage) return;
    setPendingImage({ dataUrl, image });
  };

  const addImageLayer = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    await addImageLayerFromDataUrl(dataUrl);
  };

  const applyPendingImage = async ({
    preset: pickedPreset,
    mode,
    crop,
  }: {
    preset: Preset;
    mode: 'cover' | 'fit';
    crop: ImageCrop;
  }) => {
    if (!pendingImage) return;

    if (pickedPreset !== preset) {
      setPreset(pickedPreset);
    }

    await finalizeMainPhotoLayer(pendingImage.image, {
      presetKey: pickedPreset,
      mode,
      crop,
    });
    setPendingImage(null);
  };

  const addTextLayer = (value = 'Новый текст') => {
    const id = nanoid();
    const layer: Layer = {
      id,
      type: 'text',
      text: value,
      fontFamily: defaultTextPreset?.family ?? fonts[0].family,
      fontStyle: defaultTextPreset?.fontStyle ?? 'bold',
      letterSpacing: defaultTextPreset?.letterSpacing ?? 0,
      fontSize: defaultTextPreset?.fontSize ?? 84,
      lineHeight: defaultTextPreset?.lineHeight ?? 1.2,
      align: defaultTextPreset?.align ?? 'left',
      color: defaultTextPreset?.color ?? '#241d17',
      backgroundEnabled: false,
      backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
      backgroundStyle: DEFAULT_TEXT_BACKGROUND_STYLE,
      stylePresetId: defaultTextPreset?.id,
      x: stageSize.width * 0.08,
      y: stageSize.height * 0.12,
      width: stageSize.width * 0.82,
      height: 220,
      rotation: 0,
    } as Layer;

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(id);
    setEditingTextLayerId(id);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const setCanvasExpandedState = (nextExpanded: boolean) => {
    setIsCanvasExpanded(nextExpanded);
    if (!nextExpanded) {
      setFullscreenZoom(1);
    }
  };

  const handleCanvasPinchExpand = () => {
    if (!isPhoneViewport || isCanvasExpanded) {
      return;
    }

    setFullscreenZoom(1);
    setIsCanvasExpanded(true);
  };

  const handleCanvasPinchZoom = (nextZoom: number) => {
    if (!(isPhoneViewport && isCanvasExpanded)) {
      return;
    }

    setFullscreenZoom(clamp(nextZoom, 1, 2.4));
  };

  const handleCanvasPinchCollapse = () => {
    if (!(isPhoneViewport && isCanvasExpanded)) {
      return;
    }

    setCanvasExpandedState(false);
  };

  const moveLayer = (direction: 'backward' | 'forward') => {
    if (!selectedLayerId) return;

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
    if (!selectedLayerId) {
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

    updateLayer(id, {
      x: node.x(),
      y: node.y(),
    });

    const layer = layers.find((item) => item.id === id);
    if (layer?.type === 'image') {
      setDragArmedImageId(null);
    }
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
    setPreset(nextPreset);
  };

  const handleCanvasDrop = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) {
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
          await addImageFromBlob(file);
          return;
        }
      }

      const html = data.getData('text/html');
      if (html) {
        if (
          await parseClipboardHtmlAsImage(html)
        ) {
          event.preventDefault();
          return;
        }
      }

      const text = data.getData('text/plain');
      if (text && text.trim()) {
        event.preventDefault();
        await parseClipboardTextAsImage(text);
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [
    addImageFromBlob,
    addImageFromText,
    parseClipboardHtmlAsImage,
    parseClipboardTextAsImage,
  ]);

  const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
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

  return (
    <div className="app">
      <TopBar
        selectedLayerType={selectedLayer?.type ?? null}
      />

      <main className="workbench" onPointerDown={handleWorkbenchPointerDown}>
        <ImagePicker
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

        <ActionRail
          onUploadImage={() => imageInputRef.current?.click()}
          onPaste={handlePasteFromClipboard}
          onAddText={addTextLayer}
          onUploadFont={() => fontInputRef.current?.click()}
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
          <div className="canvas-toolbar">
            {!isCanvasExpanded ? (
              <div className="preset-strip" aria-label="Canvas presets">
                {PRESETS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={preset === item.key ? 'active' : 'ghost'}
                    onClick={() => handlePresetChange(item.key)}
                  >
                    {item.key === 'story' ? '9:16' : '4:5'}
                  </button>
                ))}
              </div>
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
            scale={effectiveStageScale}
            selectedLayer={selectedLayer}
            isCompactPreview={isPhoneViewport && !isCanvasExpanded}
            isFullscreenCanvas={isPhoneViewport && isCanvasExpanded}
            fullscreenZoom={fullscreenZoom}
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
          onTextChange={updateTextField}
          onCropChange={updateImageCrop}
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
