import { useEffect, useMemo, useState } from 'react';

import { FontPicker } from './FontPicker';
import { Layer, TextLayer, UploadedFont } from '../editor/types';
import {
  DEFAULT_TEXT_BACKGROUND_COLOR,
  DEFAULT_TEXT_BACKGROUND_STYLE,
  TEXT_BACKGROUND_STYLE_OPTIONS,
} from '../editor/textHighlight';
import {
  getFontOptions,
  getTextStylePresetById,
  TextStylePreset,
} from '../editor/textPresets';

function isTextLayer(layer: Layer): layer is TextLayer {
  return layer.type === 'text';
}

type PropertiesPanelProps = {
  selectedLayer: Layer | null;
  isFirst: boolean;
  isLast: boolean;
  onMoveLayer: (direction: 'backward' | 'forward') => void;
  onChange: (id: string, changes: Partial<Layer>) => void;
  collageScale: number | null;
  onCollageScaleChange: (nextScale: number) => void;
  onTextChange: (id: string, value: string) => void;
  fonts: UploadedFont[];
  textStylePresets: TextStylePreset[];
  onSaveTextStylePreset: () => void;
  onDeleteUploadedFont: (fontId: string) => void;
};

type PanelSectionId = 'transform' | 'preset' | 'typography';

export function PropertiesPanel({
  selectedLayer,
  isFirst,
  isLast,
  onMoveLayer,
  onChange,
  collageScale,
  onCollageScaleChange,
  onTextChange,
  fonts,
  textStylePresets,
  onSaveTextStylePreset,
  onDeleteUploadedFont,
}: PropertiesPanelProps) {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const [activeSection, setActiveSection] = useState<PanelSectionId>('transform');

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!selectedLayer) {
      setActiveSection('transform');
      return;
    }

    setActiveSection(selectedLayer.type === 'text' ? 'typography' : 'transform');
  }, [selectedLayer?.id, selectedLayer?.type]);

  const layerLabel =
    selectedLayer?.type === 'image'
      ? 'Фото'
      : selectedLayer?.type === 'text'
        ? 'Текст'
        : null;
  const isCollageImage = selectedLayer?.type === 'image' && selectedLayer.kind === 'collage';
  const collageScalePercent = Math.round((collageScale ?? 1) * 100);
  const fontOptions = getFontOptions(fonts);
  const uploadedFontCount = Math.max(0, fonts.filter((font) => font.id !== 'default').length);
  const isCompactLayout = viewportWidth <= 720;
  const sectionTabs = useMemo(() => {
    if (!selectedLayer) {
      return [];
    }

    return isTextLayer(selectedLayer)
      ? [
          { id: 'typography' as const, label: 'Текст' },
          { id: 'preset' as const, label: 'Пресет' },
          { id: 'transform' as const, label: 'Слой' },
        ]
      : [{ id: 'transform' as const, label: 'Слой' }];
  }, [selectedLayer]);

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
          <p>После выбора здесь появятся точные настройки типографики и поворота.</p>
        </div>
      ) : (
        <>
          {isCompactLayout ? (
            <div className="panel-tabs" role="tablist" aria-label="Мобильные настройки слоя">
              {sectionTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={activeSection === tab.id ? 'active panel-tab' : 'ghost panel-tab'}
                  aria-selected={activeSection === tab.id}
                  onClick={() => setActiveSection(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <section
            className={`panel-section${isCompactLayout ? ' panel-section--mobile' : ''}`}
            hidden={isCompactLayout && activeSection !== 'transform'}
          >
            <div className="panel-section-head">
              <div>
                <h3>Трансформация</h3>
                <p>
                  {isCollageImage
                    ? 'Коллажную ячейку двигайте прямо на канве. Поворот и порядок слоя здесь зафиксированы.'
                    : 'Положение слоя в стеке и общий поворот.'}
                </p>
              </div>
            </div>

            <div className="buttons">
              <button
                type="button"
                className="ghost"
                onClick={() => onMoveLayer('backward')}
                disabled={isFirst || isCollageImage}
              >
                Сдвинуть назад
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => onMoveLayer('forward')}
                disabled={isLast || isCollageImage}
              >
                Сдвинуть вперед
              </button>
            </div>

            {isCollageImage ? (
              <>
                <div className="field">
                  <div className="field-head">
                    <label htmlFor="collage-scale-range">Масштаб кадра</label>
                    <span>{collageScalePercent}%</span>
                  </div>
                  <input
                    id="collage-scale-range"
                    type="range"
                    min="100"
                    max="300"
                    step="1"
                    value={collageScalePercent}
                    onChange={(event) => onCollageScaleChange(Number(event.target.value) / 100)}
                  />
                </div>

                <div className="sidebar-empty">
                  <strong>Коллаж держится по сетке</strong>
                  <p>Потяните фото на канве, чтобы сдвинуть кадр внутри ячейки, а здесь можно его приблизить или отдалить.</p>
                </div>
              </>
            ) : (
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
            )}
          </section>

          {isTextLayer(selectedLayer) ? (
            <>
              <section
                className={`panel-section${isCompactLayout ? ' panel-section--mobile' : ''}`}
                hidden={isCompactLayout && activeSection !== 'preset'}
              >
                <div className="panel-section-head">
                  <div>
                    <h3>Шрифтовой пресет</h3>
                    <p>Быстрые типографические наборы для сторис без ручной сборки.</p>
                  </div>
                  <div className="panel-section-actions">
                    <span className="field-head-badge">
                      {getTextStylePresetById(selectedLayer.stylePresetId, textStylePresets)?.label ?? 'Custom'}
                    </span>
                    <button
                      type="button"
                      className="ghost panel-inline-button"
                      onClick={onSaveTextStylePreset}
                    >
                      Сохранить стиль
                    </button>
                  </div>
                </div>

                <div className="text-preset-grid">
                  {textStylePresets.map((preset) => {
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
                            backgroundEnabled: preset.backgroundEnabled,
                            backgroundColor: preset.backgroundColor,
                            backgroundStyle: preset.backgroundStyle,
                          })
                        }
                      >
                        <div className="text-preset-meta-row">
                          <span className="text-preset-label">{preset.label}</span>
                          {preset.source === 'custom' ? (
                            <span className="text-preset-badge">Saved</span>
                          ) : null}
                        </div>
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

              <section
                className={`panel-section${isCompactLayout ? ' panel-section--mobile' : ''}`}
                hidden={isCompactLayout && activeSection !== 'typography'}
              >
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
                    <FontPicker
                      value={selectedLayer.fontFamily}
                      fontOptions={fontOptions}
                      uploadedFonts={fonts}
                      ariaLabel="Открыть меню шрифтов в панели"
                      onSelectFont={(family) =>
                        applyTextChanges(selectedLayer, {
                          fontFamily: family,
                        })
                      }
                      onDeleteUploadedFont={onDeleteUploadedFont}
                    />
                    <p className="font-picker-hint">
                      {uploadedFontCount > 0
                        ? 'Загруженные шрифты сохраняются на этом устройстве, пока вы их не удалите.'
                        : 'Импортированные шрифты будут храниться на этом устройстве и появляться здесь.'}
                    </p>
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

                  <div className="field-row">
                    <div className="field">
                      <div className="field-head">
                        <label>Фон текста</label>
                        <span>{selectedLayer.backgroundEnabled ? 'Вкл' : 'Выкл'}</span>
                      </div>
                      <button
                        type="button"
                        className={selectedLayer.backgroundEnabled ? 'active' : 'ghost'}
                        onClick={() =>
                          applyTextChanges(selectedLayer, {
                            backgroundEnabled: !selectedLayer.backgroundEnabled,
                            backgroundColor:
                              selectedLayer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR,
                            backgroundStyle:
                              selectedLayer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE,
                          })
                        }
                      >
                        {selectedLayer.backgroundEnabled ? 'Убрать плашку' : 'Добавить плашку'}
                      </button>
                    </div>

                    <div className="field field-compact">
                      <div className="field-head">
                        <label>Цвет плашки</label>
                      </div>
                      <input
                        type="color"
                        disabled={!selectedLayer.backgroundEnabled}
                        value={selectedLayer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR}
                        onChange={(event) =>
                          applyTextChanges(selectedLayer, {
                            backgroundColor: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="field">
                    <div className="field-head">
                      <label>Стиль плашки</label>
                      <span>{selectedLayer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE}</span>
                    </div>
                    <div className="text-highlight-style-grid">
                      {TEXT_BACKGROUND_STYLE_OPTIONS.map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          className={`ghost text-highlight-style-button${
                            (selectedLayer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE) === style.id
                              ? ' text-highlight-style-button--active'
                              : ''
                          }`}
                          disabled={!selectedLayer.backgroundEnabled}
                          onClick={() =>
                            applyTextChanges(selectedLayer, {
                              backgroundStyle: style.id,
                            })
                          }
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}
