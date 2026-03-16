import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { nanoid } from 'nanoid';

import { TopBar } from './components/TopBar';
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
  const [fonts, setFonts] = useState<UploadedFont[]>([DEFAULT_FONT]);
  const [stageScale, setStageScale] = useState(1);
  const [isHydrated, setIsHydrated] = useState(false);

  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  const stageSize = useMemo(() => getPresetByKey(preset), [preset]);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );

  useEffect(() => {
    const resize = () => {
      const wrapper = containerRef.current;
      if (!wrapper) return;

      const availableWidth = Math.max(280, wrapper.clientWidth - 24);
      const availableHeight = Math.max(
        320,
        window.innerHeight - (window.innerWidth >= 980 ? 220 : 260),
      );

      const scale = Math.min(
        availableWidth / stageSize.width,
        availableHeight / stageSize.height,
        1,
      );
      setStageScale(Math.max(0.15, scale));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [stageSize.width, stageSize.height]);

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
    }
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

  const addImageLayerFromDataUrl = async (dataUrl: string) => {
    const image = await loadImage(dataUrl);
    const fitScale = Math.max(stageSize.width / image.width, stageSize.height / image.height);

    const layer: Layer = {
      id: nanoid(),
      type: 'image',
      src: dataUrl,
      image,
      naturalWidth: image.width,
      naturalHeight: image.height,
      x: (stageSize.width - image.width * fitScale) / 2,
      y: (stageSize.height - image.height * fitScale) / 2,
      width: image.width * fitScale,
      height: image.height * fitScale,
      rotation: 0,
      crop: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    } as Layer;

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
  };

  const addImageLayer = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    await addImageLayerFromDataUrl(dataUrl);
  };

  const addTextLayer = (value = 'Новый текст') => {
    const id = nanoid();
    const layer: Layer = {
      id,
      type: 'text',
      text: value,
      fontFamily: fonts[0].family,
      fontSize: 84,
      lineHeight: 1.2,
      align: 'left',
      color: '#ffffff',
      x: stageSize.width * 0.08,
      y: stageSize.height * 0.12,
      width: stageSize.width * 0.82,
      height: 220,
      rotation: 0,
    } as Layer;

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(id);
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

  const updateTextAlign = (id: string, align: 'left' | 'center' | 'right') => {
    updateLayer(id, { align });
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
      updateLayer(id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width,
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
      await addImageLayer(file);
    }
  };

  const removeSelectedLayer = () => {
    if (!selectedLayerId) return;
    setLayers((prev) => prev.filter((layer) => layer.id !== selectedLayerId));
    setSelectedLayerId(null);
  };

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
        preset={preset}
        presets={PRESETS}
        onPresetChange={handlePresetChange}
        onUploadImage={() => imageInputRef.current?.click()}
        onAddText={addTextLayer}
        onUploadFont={() => fontInputRef.current?.click()}
        onDeleteSelected={removeSelectedLayer}
        onExport={handleExport}
        isExportDisabled={layers.length === 0}
        isDeleteDisabled={!selectedLayer}
      />

      <main className="workbench">
        <EditorCanvas
          containerRef={containerRef}
          stageRef={stageRef}
          layers={layers}
          width={stageSize.width}
          height={stageSize.height}
          scale={stageScale}
          selectedLayer={selectedLayer}
          onCanvasMouseDown={handleCanvasMouseDown}
          onSelectLayer={setSelectedLayerId}
          onDragEnd={handleDragEnd}
          onTransform={handleTransform}
          onDropFiles={handleCanvasDrop}
          transformerRef={transformerRef}
          nodeRefs={nodeRefs}
        />

        <PropertiesPanel
          selectedLayer={selectedLayer}
          isFirst={Boolean(selectedLayer && layers[0]?.id === selectedLayer.id)}
          isLast={Boolean(selectedLayer && layers[layers.length - 1]?.id === selectedLayer.id)}
          onMoveLayer={moveLayer}
          onChange={updateLayer}
          onAlignChange={updateTextAlign}
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
