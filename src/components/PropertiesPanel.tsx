import { ImageCrop, Layer, TextLayer, UploadedFont } from '../editor/types';
import { getFontOptions, getTextStylePresetById, TEXT_STYLE_PRESETS } from '../editor/textPresets';

function isTextLayer(layer: Layer): layer is TextLayer {
  return layer.type === 'text';
}

type PropertiesPanelProps = {
  selectedLayer: Layer | null;
  isFirst: boolean;
  isLast: boolean;
  onMoveLayer: (direction: 'backward' | 'forward') => void;
  onChange: (id: string, changes: Partial<Layer>) => void;
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
  const fontOptions = getFontOptions(fonts);

  const applyTextChanges = (
    layer: TextLayer,
    changes: Partial<TextLayer>,
    { preservePreset = false }: { preservePreset?: boolean } = {},
  ) => {
    onChange(
      layer.id,
      preservePreset
        ? changes
        : {
            ...changes,
            stylePresetId: undefined,
          },
    );
  };

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
            <>
              <section className="panel-section">
                <div className="panel-section-head">
                  <div>
                    <h3>Шрифтовой пресет</h3>
                    <p>Быстрые типографические наборы для сторис без ручной сборки.</p>
                  </div>
                  <span className="field-head-badge">
                    {getTextStylePresetById(selectedLayer.stylePresetId)?.label ?? 'Custom'}
                  </span>
                </div>

                <div className="text-preset-grid">
                  {TEXT_STYLE_PRESETS.map((preset) => {
                    const isActive = selectedLayer.stylePresetId === preset.id;

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`text-preset-button${isActive ? ' text-preset-button--active' : ''}`}
                        onClick={() =>
                          onChange(selectedLayer.id, {
                            stylePresetId: preset.id,
                            fontFamily: preset.family,
                            fontStyle: preset.fontStyle,
                            letterSpacing: preset.letterSpacing,
                            fontSize: preset.fontSize,
                            lineHeight: preset.lineHeight,
                            align: preset.align,
                            color: preset.color,
                          })
                        }
                      >
                        <span className="text-preset-label">{preset.label}</span>
                        <span
                          className="text-preset-sample"
                          style={{
                            fontFamily: preset.family,
                            fontStyle: preset.fontStyle.includes('italic') ? 'italic' : 'normal',
                            fontWeight: preset.fontStyle.includes('bold') ? 700 : 500,
                            letterSpacing: `${preset.letterSpacing}px`,
                          }}
                        >
                          {preset.sample}
                        </span>
                        <span className="text-preset-description">{preset.description}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

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
                      <span>{fontOptions.length} доступно</span>
                    </div>
                    <select
                      value={selectedLayer.fontFamily}
                      onChange={(event) =>
                        applyTextChanges(selectedLayer, {
                          fontFamily: event.target.value,
                        })
                      }
                    >
                      {fontOptions.map((font) => (
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
                        applyTextChanges(selectedLayer, {
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
                        applyTextChanges(selectedLayer, {
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
                          applyTextChanges(selectedLayer, {
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
                          applyTextChanges(selectedLayer, {
                            align: event.target.value as 'left' | 'center' | 'right',
                          })
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
            </>
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
