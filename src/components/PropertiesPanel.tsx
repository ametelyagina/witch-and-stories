import { ImageCrop, Layer, TextLayer, UploadedFont } from '../editor/types';

function isTextLayer(layer: Layer): layer is TextLayer {
  return layer.type === 'text';
}

type PropertiesPanelProps = {
  selectedLayer: Layer | null;
  isFirst: boolean;
  isLast: boolean;
  onMoveLayer: (direction: 'backward' | 'forward') => void;
  onChange: (id: string, changes: Partial<Layer>) => void;
  onAlignChange: (id: string, align: 'left' | 'center' | 'right') => void;
  onTextChange: (id: string, value: string) => void;
  onCropChange: (id: string, axis: keyof ImageCrop, value: number) => void;
  fonts: UploadedFont[];
};

export function PropertiesPanel({
  selectedLayer,
  isFirst,
  isLast,
  onMoveLayer,
  onChange,
  onAlignChange,
  onTextChange,
  onCropChange,
  fonts,
}: PropertiesPanelProps) {
  return (
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
            <button type="button" onClick={() => onMoveLayer('backward')} disabled={isFirst}>
              Назад
            </button>
            <button type="button" onClick={() => onMoveLayer('forward')} disabled={isLast}>
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
              onChange(selectedLayer.id, {
                rotation: Number(event.target.value),
              })
            }
          />

          {isTextLayer(selectedLayer) ? (
            <div className="stack">
              <label>Текст</label>
              <textarea
                value={selectedLayer.text}
                onChange={(event) => onTextChange(selectedLayer.id, event.target.value)}
              />

              <label>Шрифт</label>
              <select
                value={selectedLayer.fontFamily}
                onChange={(event) =>
                  onChange(selectedLayer.id, {
                    fontFamily: event.target.value,
                  })
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
                  onChange(selectedLayer.id, {
                    fontSize: Number(event.target.value),
                  })
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
                  onChange(selectedLayer.id, {
                    lineHeight: Number(event.target.value),
                  })
                }
              />

              <label>Цвет</label>
              <input
                type="color"
                value={selectedLayer.color}
                onChange={(event) =>
                  onChange(selectedLayer.id, {
                    color: event.target.value,
                  })
                }
              />

              <label>Выравнивание</label>
              <select
                value={selectedLayer.align}
                onChange={(event) =>
                  onAlignChange(
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
                onChange={(event) => onCropChange(selectedLayer.id, 'x', Number(event.target.value))}
              />

              <label>Кадрирование Y: {selectedLayer.crop.y.toFixed(0)}%</label>
              <input
                type="range"
                min="0"
                max="95"
                value={selectedLayer.crop.y}
                onChange={(event) => onCropChange(selectedLayer.id, 'y', Number(event.target.value))}
              />

              <label>Ширина кадра: {selectedLayer.crop.width.toFixed(0)}%</label>
              <input
                type="range"
                min="5"
                max="100"
                value={selectedLayer.crop.width}
                onChange={(event) => onCropChange(selectedLayer.id, 'width', Number(event.target.value))}
              />

              <label>Высота кадра: {selectedLayer.crop.height.toFixed(0)}%</label>
              <input
                type="range"
                min="5"
                max="100"
                value={selectedLayer.crop.height}
                onChange={(event) => onCropChange(selectedLayer.id, 'height', Number(event.target.value))}
              />
            </div>
          )}
        </>
      )}
    </aside>
  );
}
