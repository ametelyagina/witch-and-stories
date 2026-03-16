import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Layer as KonvaLayer,
  Stage,
  Text,
  Transformer,
  Image as KonvaImage,
} from 'react-konva';
import Konva from 'konva';
import { nanoid } from 'nanoid';

type Preset = 'story' | 'carousel';

type PresetDefinition = {
  key: Preset;
  label: string;
  width: number;
  height: number;
};

const PRESETS: PresetDefinition[] = [
  { key: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
  { key: 'carousel', label: 'Carousel 4:5', width: 1080, height: 1350 },
];

type UploadedFont = {
  id: string;
  name: string;
  family: string;
  dataUrl?: string;
};

type BaseLayer = {
  id: string;
  type: 'image' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageLayer = BaseLayer & {
  type: 'image';
  src: string;
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  crop: ImageCrop;
};

type TextLayer = BaseLayer & {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  color: string;
};

type Layer = ImageLayer | TextLayer;
type PersistedImageLayer = Omit<ImageLayer, 'image'>;
type PersistedLayer = PersistedImageLayer | TextLayer;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const STORAGE_KEY = 'story-text-editor-state-v1';

const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ошибка загрузки изображения.'));
    img.src = src;
  });
};

const readFileAsDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Не удалось считать файл.'));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла.'));
    reader.readAsDataURL(file);
  });
};

const getPresetByKey = (key: Preset) => PRESETS.find((item) => item.key === key)!;

function App() {
  const [preset, setPreset] = useState<Preset>('story');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<UploadedFont[]>([
    { id: 'default', name: 'System', family: 'Arial' },
  ]);
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
    const normalizeFont = (value: unknown): UploadedFont | null => {
      if (!value || typeof value !== 'object') return null;
      const font = value as { id?: string; name?: string; family?: string; dataUrl?: unknown };
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

    const normalizeLayer = (value: unknown): PersistedLayer | null => {
      if (!value || typeof value !== 'object') return null;
      const layer = value as {
        id?: string;
        type?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        rotation?: number;
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
          text?: string;
          fontFamily?: string;
          fontSize?: number;
          lineHeight?: number;
          align?: 'left' | 'center' | 'right';
          color?: string;
        };
        if (
          typeof textLayer.text !== 'string' ||
          typeof textLayer.fontFamily !== 'string' ||
          typeof textLayer.fontSize !== 'number' ||
          typeof textLayer.lineHeight !== 'number' ||
          typeof textLayer.align !== 'string' ||
          typeof textLayer.color !== 'string'
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
          fontSize: textLayer.fontSize,
          lineHeight: textLayer.lineHeight,
          align: textLayer.align,
          color: textLayer.color,
        };
      }

      const imageLayer = value as {
        src?: string;
        naturalWidth?: number;
        naturalHeight?: number;
        crop?: ImageCrop;
      };
      if (
        typeof imageLayer.src !== 'string' ||
        typeof imageLayer.naturalWidth !== 'number' ||
        typeof imageLayer.naturalHeight !== 'number'
      ) {
        return null;
      }

      if (!imageLayer.crop || typeof imageLayer.crop.x !== 'number' || typeof imageLayer.crop.y !== 'number' || typeof imageLayer.crop.width !== 'number' || typeof imageLayer.crop.height !== 'number') {
        return null;
      }

      return {
        id: layer.id,
        type: 'image',
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        src: imageLayer.src,
        naturalWidth: imageLayer.naturalWidth,
        naturalHeight: imageLayer.naturalHeight,
        crop: {
          x: imageLayer.crop.x,
          y: imageLayer.crop.y,
          width: imageLayer.crop.width,
          height: imageLayer.crop.height,
        },
      };
    };

    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setIsHydrated(true);
          return;
        }

        const parsed = JSON.parse(raw) as {
          preset?: Preset;
          layers?: unknown[];
          selectedLayerId?: unknown;
          fonts?: unknown[];
        };

        const restoredPreset: Preset = parsed.preset === 'carousel' ? 'carousel' : 'story';
        const baseFont: UploadedFont = { id: 'default', name: 'System', family: 'Arial' };
        const restoredFonts = [
          baseFont,
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
              // skip invalid font payload
            }
          }),
        );

        const parsedLayers = Array.isArray(parsed.layers)
          ? (parsed.layers as unknown[]).map(normalizeLayer).filter(Boolean)
            : [];
        const restoredLayers = await Promise.all(
          parsedLayers.map(async (layer) => {
            if (layer.type === 'text') {
              return layer;
            }

            if (!layer.src.startsWith('data:')) {
              return null;
            }

            try {
              const image = await loadImage(layer.src);
              return {
                ...layer,
                image,
              } as ImageLayer;
            } catch {
              return null;
            }
          }),
        );

        const normalizedLayers = restoredLayers.filter((layer): layer is Layer =>
          layer !== null && (layer.type !== 'image' || (layer.image.naturalWidth > 0)),
        );
        const normalized = normalizedLayers.map((layer) =>
          layer.type === 'text' ? {
            ...layer,
            fontFamily: fontFamilies.has(layer.fontFamily) ? layer.fontFamily : baseFont.family,
          } : layer,
        );

        const nextSelectedLayerId = typeof parsed.selectedLayerId === 'string'
          ? parsed.selectedLayerId
          : null;

        const hasSelectedLayer = normalized.some((layer) => layer.id === nextSelectedLayerId);

        setPreset(restoredPreset);
        setFonts(restoredFonts);
        setLayers(normalized);
        setSelectedLayerId(hasSelectedLayer ? nextSelectedLayerId : null);
      } catch {
        // ignore corrupted state
      } finally {
        setIsHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const serializableLayers = layers.map((layer) => {
      if (layer.type === 'image') {
        const { image, ...rest } = layer;
        return rest;
      }

      return layer;
    });

    const payload = {
      preset,
      selectedLayerId,
      fonts,
      layers: serializableLayers,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // storage unavailable or too large
    }
  }, [isHydrated, preset, selectedLayerId, layers, fonts]);

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
      prevLayers.map((layer) =>
        layer.id === id ? ({ ...layer, ...changes } as Layer) : layer,
      ),
    );
  };

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.target === event.target.getStage()) {
      setSelectedLayerId(null);
    }
  };

  const addImageLayer = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const fitScale = Math.max(
      stageSize.width / image.width,
      stageSize.height / image.height,
    );

    const layer: ImageLayer = {
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
    };

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(layer.id);
  };

  const addTextLayer = () => {
    const id = nanoid();
    const layer: TextLayer = {
      id,
      type: 'text',
      text: 'Новый текст',
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
    };

    setLayers((prev) => [...prev, layer]);
    setSelectedLayerId(id);
  };

  const updateTextField = (id: string, value: string) => {
    const layer = layers.find((item) => item.id === id);
    if (!layer || layer.type !== 'text') return;
    updateLayer(id, { text: value } as Partial<Layer>);
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

  const handleUploadImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await addImageLayer(file);
    event.target.value = '';
  };

  const handleUploadFont = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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

  const handleTransform = (id: string, event: Konva.KonvaEventObject<Event>) => {
    const node = event.target;
    const layer = layers.find((item) => item.id === id);
    if (!layer || !(node instanceof Konva.Node)) return;

    const scaleX = node.scaleX();

    node.scaleX(1);
    node.scaleY(1);

    if (layer.type === 'text') {
      const width = clamp(node.width() * scaleX, 40, stageSize.width * 3);
      updateLayer(id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width,
        height: layer.height,
      });
    } else {
      const scaleY = node.scaleY();
      const width = clamp(node.width() * scaleX, 24, stageSize.width * 3);
      const height = clamp(node.height() * scaleY, 24, stageSize.height * 3);
      updateLayer(id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width,
        height,
      });
    }
  };

  const handleDragEnd = (id: string, event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target;
    if (!(node instanceof Konva.Node)) return;
    updateLayer(id, {
      x: node.x(),
      y: node.y(),
    } as Partial<Layer>);
  };

  const handleExport = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ pixelRatio: 3, mimeType: 'image/png' });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${preset}-${Date.now()}.png`;
    link.click();
  };

  const updateTextAlign = (id: string, align: 'left' | 'center' | 'right') => {
    const layer = layers.find((item) => item.id === id);
    if (!layer || layer.type !== 'text') return;
    updateLayer(id, { align } as Partial<Layer>);
  };

  const updateImageCrop = (axis: keyof ImageCrop, value: number) => {
    if (!selectedLayer || selectedLayer.type !== 'image') return;

    const updates = { ...selectedLayer.crop, [axis]: value };
    if (updates.width < 5) updates.width = 5;
    if (updates.height < 5) updates.height = 5;
    updates.x = clamp(updates.x, 0, 100 - updates.width);
    updates.y = clamp(updates.y, 0, 100 - updates.height);

    updateLayer(selectedLayer.id, { crop: updates } as Partial<Layer>);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Stories Editor</div>
        <div className="segment">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={preset === item.key ? 'active' : ''}
              onClick={() => setPreset(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={() => imageInputRef.current?.click()}>
            Загрузить фото
          </button>
          <button type="button" onClick={addTextLayer}>
            Добавить текст
          </button>
          <button type="button" onClick={() => fontInputRef.current?.click()}>
            Загрузить шрифт (.ttf)
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={layers.length === 0}
            className="export"
          >
            Экспорт PNG
          </button>
        </div>
      </header>

      <main className="workbench">
        <section className="canvas-wrap" ref={containerRef}>
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            scaleX={stageScale}
            scaleY={stageScale}
            onMouseDown={handleStageMouseDown}
            onTouchStart={handleStageMouseDown}
          >
            <KonvaLayer>
              {layers.map((layer) =>
                layer.type === 'image' ? (
                  <KonvaImage
                    key={layer.id}
                    x={layer.x}
                    y={layer.y}
                    image={layer.image}
                    draggable
                    rotation={layer.rotation}
                    width={layer.width}
                    height={layer.height}
                    crop={{
                      x: (layer.crop.x / 100) * layer.naturalWidth,
                      y: (layer.crop.y / 100) * layer.naturalHeight,
                      width: (layer.crop.width / 100) * layer.naturalWidth,
                      height: (layer.crop.height / 100) * layer.naturalHeight,
                    }}
                    onClick={() => setSelectedLayerId(layer.id)}
                    onTap={() => setSelectedLayerId(layer.id)}
                    onDragEnd={(event) => handleDragEnd(layer.id, event)}
                    onTransformEnd={(event) => handleTransform(layer.id, event)}
                    ref={(node) => {
                      if (node) {
                        nodeRefs.current[layer.id] = node;
                      }
                    }}
                  />
                ) : (
                  <Text
                    key={layer.id}
                    x={layer.x}
                    y={layer.y}
                    text={layer.text}
                    width={layer.width}
                    height={layer.height}
                    draggable
                    rotation={layer.rotation}
                    fontFamily={layer.fontFamily}
                    fontSize={layer.fontSize}
                    fill={layer.color}
                    align={layer.align}
                    lineHeight={layer.lineHeight}
                    wrap="word"
                    onClick={() => setSelectedLayerId(layer.id)}
                    onTap={() => setSelectedLayerId(layer.id)}
                    onDragEnd={(event) => handleDragEnd(layer.id, event)}
                    onTransformEnd={(event) => handleTransform(layer.id, event)}
                    ref={(node) => {
                      if (node) {
                        nodeRefs.current[layer.id] = node;
                      }
                    }}
                  />
                ),
              )}
              <Transformer
                ref={transformerRef}
                rotateEnabled
                ignoreStroke
                keepRatio={selectedLayer?.type === 'image'}
              />
            </KonvaLayer>
          </Stage>
          <p className="hint">Нажмите на область без слоя, чтобы снять выделение.</p>
        </section>

        <aside className="sidebar">
          <h2>Свойства</h2>
          {!selectedLayer ? (
            <p className="hint">Выберите слой на холсте или добавьте новый.</p>
          ) : (
            <>
              <p className="label">
                Тип слоя: {selectedLayer.type === 'image' ? 'Изображение' : 'Текст'}
              </p>

              <div className="buttons">
                <button
                  type="button"
                  onClick={() => moveLayer('backward')}
                  disabled={layers[0]?.id === selectedLayer.id}
                >
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => moveLayer('forward')}
                  disabled={layers[layers.length - 1]?.id === selectedLayer.id}
                >
                  Вперед
                </button>
              </div>

              <label>Вращение: {selectedLayer.rotation.toFixed(0)}°</label>
              <input
                type="range"
                min="-45"
                max="45"
                value={selectedLayer.rotation}
                onChange={(event) =>
                  updateLayer(selectedLayer.id, {
                    rotation: Number(event.target.value),
                  } as Partial<Layer>)
                }
              />

              {selectedLayer.type === 'text' ? (
                <div className="stack">
                  <label>Текст</label>
                  <textarea
                    value={selectedLayer.text}
                    onChange={(event) =>
                      updateTextField(selectedLayer.id, event.target.value)
                    }
                  />

                  <label>Шрифт</label>
                  <select
                    value={selectedLayer.fontFamily}
                    onChange={(event) =>
                      updateLayer(selectedLayer.id, {
                        fontFamily: event.target.value,
                      } as Partial<Layer>)
                    }
                  >
                    {fonts.map((font) => (
                      <option key={font.id} value={font.family}>
                        {font.name}
                      </option>
                    ))}
                  </select>

                  <label>Размер</label>
                  <input
                    type="range"
                    min="14"
                    max="220"
                    value={selectedLayer.fontSize}
                    onChange={(event) =>
                      updateLayer(selectedLayer.id, {
                        fontSize: Number(event.target.value),
                      } as Partial<Layer>)
                    }
                  />

                  <label>Межстрочный интервал</label>
                  <input
                    type="range"
                    min="0.8"
                    max="2.4"
                    step="0.05"
                    value={selectedLayer.lineHeight}
                    onChange={(event) =>
                      updateLayer(selectedLayer.id, {
                        lineHeight: Number(event.target.value),
                      } as Partial<Layer>)
                    }
                  />

                  <label>Цвет</label>
                  <input
                    type="color"
                    value={selectedLayer.color}
                    onChange={(event) =>
                      updateLayer(selectedLayer.id, {
                        color: event.target.value,
                      } as Partial<Layer>)
                    }
                  />

                  <label>Выравнивание</label>
                  <select
                    value={selectedLayer.align}
                    onChange={(event) =>
                      updateTextAlign(
                        selectedLayer.id,
                        event.target.value as 'left' | 'center' | 'right',
                      )
                    }
                  >
                    <option value="left">Слева</option>
                    <option value="center">По центру</option>
                    <option value="right">Справа</option>
                  </select>
                </div>
              ) : (
                <div className="stack">
                  <label>Кадрирование X: {selectedLayer.crop.x.toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={selectedLayer.crop.x}
                    onChange={(event) =>
                      updateImageCrop('x', Number(event.target.value))
                    }
                  />

                  <label>Кадрирование Y: {selectedLayer.crop.y.toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={selectedLayer.crop.y}
                    onChange={(event) =>
                      updateImageCrop('y', Number(event.target.value))
                    }
                  />

                  <label>Ширина кадра: {selectedLayer.crop.width.toFixed(0)}%</label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={selectedLayer.crop.width}
                    onChange={(event) =>
                      updateImageCrop('width', Number(event.target.value))
                    }
                  />

                  <label>Высота кадра: {selectedLayer.crop.height.toFixed(0)}%</label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={selectedLayer.crop.height}
                    onChange={(event) =>
                      updateImageCrop('height', Number(event.target.value))
                    }
                  />
                </div>
              )}
            </>
          )}
        </aside>
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
