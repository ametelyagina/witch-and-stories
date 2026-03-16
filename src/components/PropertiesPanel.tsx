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
  const layerLabel =
    selectedLayer?.type === 'image'
      ? 'Фото'
      : selectedLayer?.type === 'text'
        ? 'Текст'
        : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h2>{selectedLayer ? 'Параметры слоя' : 'Параметры'}</h2>
          <p className="sidebar-copy">
            {selectedLayer
              ? 'Правый блок для точной настройки выбранного элемента.'
              : 'Сначала выберите фото или текст на холсте, чтобы открыть параметры.'}
          </p>
        </div>
        {layerLabel ? <span className="selection-pill">слой: {layerLabel}</span> : null}
      </div>

      {!selectedLayer ? (
        <div className="sidebar-empty">
          <strong>Выберите слой</strong>
          <p>После выбора здесь появятся точные настройки типографики, кадра и поворота.</p>
        </div>
      ) : (
        <>
          <section className="panel-section">
            <div className="panel-section-head">
              <div>
                <h3>Трансформация</h3>
                <p>Положение слоя в стеке и общий поворот.</p>
              </div>
            </div>

            <div className="buttons">
              <button type="button" className="ghost" onClick={() => onMoveLayer('backward')} disabled={isFirst}>
                Сдвинуть назад
              </button>
              <button type="button" className="ghost" onClick={() => onMoveLayer('forward')} disabled={isLast}>
                Сдвинуть вперед
              </button>
            </div>

            <div className="field">
              <div className="field-head">
                <label>Вращение</label>
                <span>{selectedLayer.rotation.toFixed(0)}°</span>
              </div>
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
            </div>
          </section>

          {isTextLayer(selectedLayer) ? (
            <section className="panel-section">
              <div className="panel-section-head">
                <div>
                  <h3>Типографика</h3>
                  <p>Текст, шрифт, цвет и ритм набора.</p>
                </div>
              </div>

              <div className="stack">
                <div className="field">
                  <div className="field-head">
                    <label>Текст</label>
                    <span>{selectedLayer.text.length} симв.</span>
                  </div>
                  <textarea
                    value={selectedLayer.text}
                    onChange={(event) => onTextChange(selectedLayer.id, event.target.value)}
                  />
                </div>

                <div className="field">
                  <div className="field-head">
                    <label>Шрифт</label>
                    <span>{fonts.length} доступно</span>
                  </div>
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
                </div>

                <div className="field">
                  <div className="field-head">
                    <label>Размер</label>
                    <span>{selectedLayer.fontSize}px</span>
                  </div>
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
                </div>

                <div className="field">
                  <div className="field-head">
                    <label>Межстрочный интервал</label>
                    <span>{selectedLayer.lineHeight.toFixed(2)}</span>
                  </div>
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
                </div>

                <div className="field-row">
                  <div className="field field-compact">
                    <div className="field-head">
                      <label>Цвет</label>
                    </div>
                    <input
                      type="color"
                      value={selectedLayer.color}
                      onChange={(event) =>
                        onChange(selectedLayer.id, {
                          color: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="field">
                    <div className="field-head">
                      <label>Выравнивание</label>
                    </div>
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
                </div>
              </div>
            </section>
          ) : (
            <section className="panel-section">
              <div className="panel-section-head">
                <div>
                  <h3>Кадр</h3>
                  <p>Тонкая подрезка внутри уже выбранного кадра.</p>
                </div>
              </div>

              <div className="stack">
                <div className="field">
                  <div className="field-head">
                    <label>Кадрирование X</label>
                    <span>{selectedLayer.crop.x.toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={selectedLayer.crop.x}
                    onChange={(event) => onCropChange(selectedLayer.id, 'x', Number(event.target.value))}
                  />
                </div>

                <div className="field">
                  <div className="field-head">
                    <label>Кадрирование Y</label>
                    <span>{selectedLayer.crop.y.toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={selectedLayer.crop.y}
                    onChange={(event) => onCropChange(selectedLayer.id, 'y', Number(event.target.value))}
                  />
                </div>

                <div className="field">
                  <div className="field-head">
                    <label>Ширина кадра</label>
                    <span>{selectedLayer.crop.width.toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={selectedLayer.crop.width}
                    onChange={(event) => onCropChange(selectedLayer.id, 'width', Number(event.target.value))}
                  />
                </div>

                <div className="field">
                  <div className="field-head">
                    <label>Высота кадра</label>
                    <span>{selectedLayer.crop.height.toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={selectedLayer.crop.height}
                    onChange={(event) => onCropChange(selectedLayer.id, 'height', Number(event.target.value))}
                  />
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
