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

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ошибка загрузки изображения.'));
    img.src = src;
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
    const objectUrl = URL.createObjectURL(file);
    const image = await loadImage(objectUrl);
    const fitScale = Math.min(
      (stageSize.width * 0.9) / image.width,
      (stageSize.height * 0.9) / image.height,
      1,
    );

    const layer: ImageLayer = {
      id: nanoid(),
      type: 'image',
      src: objectUrl,
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
    const family = `custom-${nanoid()}`;
    const font = new FontFace(family, buffer);
    await font.load();
    document.fonts.add(font);

    setFonts((prev) => [...prev, { id: family, name: file.name, family }]);
    event.target.value = '';
  };

  const handleTransform = (id: string, event: Konva.KonvaEventObject<Event>) => {
    const node = event.target;
    const layer = layers.find((item) => item.id === id);
    if (!layer || !(node instanceof Konva.Node)) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = clamp(node.width() * scaleX, 24, stageSize.width * 3);
    const height = clamp(node.height() * scaleY, 24, stageSize.height * 3);

    node.scaleX(1);
    node.scaleY(1);

    if (layer.type === 'text') {
      updateLayer(id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width,
        height,
        fontSize: clamp(
          Math.round(layer.fontSize * Math.max(scaleX, scaleY)),
          14,
          220,
        ),
      });
    } else {
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
                keepRatio={false}
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
