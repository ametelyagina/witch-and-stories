import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  UploadedFont,
  Preset,
  PRESETS,
} from './editor/types';
import { DEFAULT_TEXT_STYLE_PRESET_ID, getTextStylePresetById } from './editor/textPresets';
import { readFileAsDataUrl, loadImage } from './utils/media';
import { clamp } from './utils/math';
import { readState, saveState } from './utils/storage';

function getPresetByKey(preset: Preset) {
  return PRESETS.find((item) => item.key === preset)!;
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
  const [stageScale, setStageScale] = useState(1);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    image: HTMLImageElement;
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const defaultTextPreset = getTextStylePresetById(DEFAULT_TEXT_STYLE_PRESET_ID);

  const stageSize = useMemo(() => getPresetByKey(preset), [preset]);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );
  const isPhoneViewport = viewport.width <= 720;

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
      const availableWidth = Math.max(280, wrapper.clientWidth - 24);
      const isStackedWorkbench = nextViewport.width <= 1120;
      let availableHeight = isStackedWorkbench
        ? stageSize.height
        : Math.max(220, nextViewport.height - wrapperBounds.top - 44);

      if (nextViewport.width <= 720) {
        availableHeight = isCanvasExpanded
          ? Math.max(320, nextViewport.height - wrapperBounds.top - 24)
          : Math.max(240, Math.min(nextViewport.height * 0.4, 320));
      }

      const scale = Math.min(availableWidth / stageSize.width, availableHeight / stageSize.height, 1);
      setStageScale(Math.max(0.15, scale));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [isCanvasExpanded, stageSize.width, stageSize.height]);

  useEffect(() => {
    if (!isPhoneViewport && isCanvasExpanded) {
      setIsCanvasExpanded(false);
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
        setSelectedLayerId(restored.selectedLayerId);
      }
      setIsHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveState({
      preset,
      selectedLayerId,
      layers,
      fonts,
    });
  }, [fonts, isHydrated, layers, preset, selectedLayerId]);

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

  const handleCanvasMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.target === event.target.getStage()) {
      setSelectedLayerId(null);
      setDragArmedImageId(null);
      setIsTextToolsOpen(false);
      setEditingTextLayerId(null);
    }
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
    color?: string;
  }) => {
    if (selectedLayer?.type !== 'text') {
      return;
    }

    updateLayer(selectedLayer.id, {
      ...changes,
      stylePresetId: undefined,
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

  const addImageFromBlob = async (blob: Blob) => {
    const imageDataUrl = await readBlobAsDataUrl(blob);
    await addImageLayerFromDataUrl(imageDataUrl);
  };

  const addImageFromText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    if (trimmed.startsWith('data:image/')) {
      await addImageLayerFromDataUrl(trimmed);
      return true;
    }

    const looksLikeImageUrl =
      /^(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:\?\S*)?)$/i.test(trimmed);
    if (!looksLikeImageUrl) return false;

    const response = await fetch(trimmed, { mode: 'cors' });
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return false;

    await addImageFromBlob(blob);
    return true;
  };

  const finalizeMainPhotoLayer = (
    image: HTMLImageElement,
    dataUrl: string,
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
    const crop = options.crop || {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    if (options.mode === 'fit') {
      const fitScale = Math.min(target.width / image.width, target.height / image.height);
      width = image.width * fitScale;
      height = image.height * fitScale;
      x = (target.width - width) / 2;
      y = (target.height - height) / 2;
    }
    const layer: Layer = {
      id: nanoid(),
      type: 'image',
      src: dataUrl,
      image,
      naturalWidth: image.width,
      naturalHeight: image.height,
      x,
      y,
      width,
      height,
      rotation: 0,
      crop,
    } as Layer;

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setEditingTextLayerId(null);
    setIsTextToolsOpen(false);
    setDragArmedImageId(null);
  };

  const addImageLayerFromDataUrl = async (dataUrl: string) => {
    if (pendingImage) return;

    const image = await loadImage(dataUrl);
    setPendingImage({ dataUrl, image });
  };

  const addImageLayer = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    await addImageLayerFromDataUrl(dataUrl);
  };

  const applyPendingImage = ({
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

    finalizeMainPhotoLayer(pendingImage.image, pendingImage.dataUrl, {
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

  const handleExport = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const dataUrl = stage.toDataURL({
      pixelRatio: 3,
      mimeType: 'image/png',
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${preset}-${Date.now()}.png`;
    link.click();
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
    if (!armedLayer || armedLayer.type !== 'image' || selectedLayerId !== dragArmedImageId) {
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

  const parseClipboardTextAsImage = async (text: string) => {
    const insertedAsImage = await addImageFromText(text);
    if (insertedAsImage) return;
    await addTextToSelectionOrNewLayer(text);
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
        const imageFromTag = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(html)?.[1];
        if (imageFromTag) {
          event.preventDefault();
          if (await addImageFromText(imageFromTag)) {
            return;
          }
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

  return (
    <div className="app">
      <TopBar
        selectedLayerType={selectedLayer?.type ?? null}
      />

      <main className="workbench">
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

            {isPhoneViewport ? (
              <button
                type="button"
                className={isCanvasExpanded ? 'secondary canvas-expand-button' : 'ghost canvas-expand-button'}
                onClick={() => setIsCanvasExpanded((current) => !current)}
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
            scale={stageScale}
            selectedLayer={selectedLayer}
            isCompactPreview={isPhoneViewport && !isCanvasExpanded}
            dragArmedImageId={dragArmedImageId}
            isTextToolsOpen={isTextToolsOpen}
            editingTextLayerId={editingTextLayerId}
            onCanvasMouseDown={handleCanvasMouseDown}
            onSelectLayer={handleSelectLayer}
            onTapImageLayer={handleTapImageLayer}
            onArmImageDrag={handleArmImageDrag}
            onToggleTextTools={handleToggleTextTools}
            onQuickTextStyleChange={handleQuickTextStyleChange}
            onDeleteSelected={removeSelectedLayer}
            onStartEditingText={handleStartEditingText}
            onStopEditingText={handleStopEditingText}
            onInlineTextChange={updateTextField}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onDropFiles={handleCanvasDrop}
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
        />
      </main>

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
