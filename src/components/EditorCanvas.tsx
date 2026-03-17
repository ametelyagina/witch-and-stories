import { CSSProperties, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

import { FontPicker } from './FontPicker';
import { Layer, TextAlign, TextLayer, UploadedFont } from '../editor/types';
import { buildTextHighlightRects, DEFAULT_TEXT_BACKGROUND_COLOR } from '../editor/textHighlight';
import { FontOption } from '../editor/textPresets';
import { Stage, Layer as KonvaLayer, Text, Transformer, Image as KonvaImage, Group, Rect } from 'react-konva';
import Konva from 'konva';
import { DragEvent, MutableRefObject, RefObject } from 'react';

function isTextLayer(layer: Layer | null): layer is TextLayer {
  return layer?.type === 'text';
}

function clampToFrame(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type EditorCanvasProps = {
  stageRef: RefObject<Konva.Stage | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  layers: Layer[];
  width: number;
  height: number;
  scale: number;
  selectedLayer: Layer | null;
  isCompactPreview: boolean;
  isFullscreenCanvas: boolean;
  dragArmedImageId: string | null;
  isTextToolsOpen: boolean;
  editingTextLayerId: string | null;
  fontOptions: FontOption[];
  uploadedFonts: UploadedFont[];
  onCanvasMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onSelectLayer: (id: string) => void;
  onTapImageLayer: (id: string) => void;
  onArmImageDrag: (id: string) => void;
  onToggleTextTools: () => void;
  onQuickTextStyleChange: (changes: {
    fontSize?: number;
    lineHeight?: number;
    fontFamily?: string;
    color?: string;
    align?: TextAlign;
    backgroundEnabled?: boolean;
    backgroundColor?: string;
  }) => void;
  onDeleteUploadedFont: (fontId: string) => void;
  onDeleteSelected: () => void;
  onStartEditingText: (id: string) => void;
  onStopEditingText: () => void;
  onInlineTextChange: (id: string, value: string) => void;
  onDragEnd: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransform: (id: string, event: Konva.KonvaEventObject<Event>) => void;
  transformerRef: RefObject<Konva.Transformer | null>;
  nodeRefs: MutableRefObject<Record<string, Konva.Node>>;
  onDropFiles: (files: File[]) => void;
};

export function EditorCanvas({
  layers,
  width,
  height,
  scale,
  selectedLayer,
  isCompactPreview,
  isFullscreenCanvas,
  dragArmedImageId,
  isTextToolsOpen,
  editingTextLayerId,
  fontOptions,
  uploadedFonts,
  onCanvasMouseDown,
  onSelectLayer,
  onTapImageLayer,
  onArmImageDrag,
  onToggleTextTools,
  onQuickTextStyleChange,
  onDeleteUploadedFont,
  onDeleteSelected,
  onStartEditingText,
  onStopEditingText,
  onInlineTextChange,
  onDragEnd,
  onTransform,
  transformerRef,
  nodeRefs,
  stageRef,
  containerRef,
  onDropFiles,
}: EditorCanvasProps) {
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);

  const focusInlineEditor = () => {
    const textarea = textEditorRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus({ preventScroll: true });
    const length = textarea.value.length;
    textarea.setSelectionRange(length, length);
  };

  const openInlineEditor = (id: string) => {
    flushSync(() => {
      onStartEditingText(id);
    });

    requestAnimationFrame(() => {
      focusInlineEditor();
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onDropFiles(files);
    }
  };
  const selectedTextLayer = isTextLayer(selectedLayer) ? selectedLayer : null;
  const isEditingSelectedText = Boolean(
    selectedTextLayer && editingTextLayerId === selectedTextLayer.id,
  );
  const frameWidth = Math.round(width * scale);
  const frameHeight = Math.round(height * scale);

  useEffect(() => {
    if (!isEditingSelectedText || !textEditorRef.current) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      focusInlineEditor();
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isEditingSelectedText, selectedTextLayer?.id]);

  let selectionToolbarStyle: CSSProperties | undefined;
  let selectionPopoverStyle: CSSProperties | undefined;
  let inlineEditorStyle: CSSProperties | undefined;
  const estimatedPopoverHeight = 432;

  if (selectedTextLayer) {
    const toolbarWidth = 72;
    const popoverWidth = Math.min(228, frameWidth - 12);
    const selectionTop = selectedTextLayer.y * scale;
    const selectionRight = (selectedTextLayer.x + selectedTextLayer.width) * scale;
    const selectionBottom = (selectedTextLayer.y + selectedTextLayer.height) * scale;
    const toolbarLeft = clampToFrame(
      selectionRight - toolbarWidth,
      8,
      Math.max(8, frameWidth - toolbarWidth - 8),
    );
    const toolbarTop = clampToFrame(
      selectionTop - 40,
      8,
      Math.max(8, frameHeight - 44),
    );
    const popoverLeft = clampToFrame(
      selectionRight - popoverWidth,
      8,
      Math.max(8, frameWidth - popoverWidth - 8),
    );
    const popoverBelowTop = selectionBottom + 12;
    const popoverAboveTop = selectionTop - estimatedPopoverHeight - 12;
    const minPopoverTop = 8;
    const maxPopoverTop = Math.max(8, frameHeight - estimatedPopoverHeight - 8);
    const canPlaceBelow = popoverBelowTop + estimatedPopoverHeight <= frameHeight - 8;
    const canPlaceAbove = popoverAboveTop >= 8;
    const popoverTop =
      isCompactPreview && !isFullscreenCanvas
        ? selectionTop < frameHeight / 2
          ? popoverBelowTop
          : popoverAboveTop
        : canPlaceBelow
          ? popoverBelowTop
          : canPlaceAbove
            ? popoverAboveTop
            : clampToFrame(
                selectionBottom + 12,
                minPopoverTop,
                maxPopoverTop,
              );

    selectionToolbarStyle = {
      left: `${toolbarLeft}px`,
      top: `${toolbarTop}px`,
    };

    selectionPopoverStyle = {
      left: `${popoverLeft}px`,
      top: `${popoverTop}px`,
      width: `${popoverWidth}px`,
    };

    inlineEditorStyle = {
      left: `${selectedTextLayer.x * scale}px`,
      top: `${selectedTextLayer.y * scale}px`,
      width: `${Math.max(selectedTextLayer.width * scale, 140)}px`,
      height: `${Math.max(selectedTextLayer.height * scale, 88)}px`,
      transform: `rotate(${selectedTextLayer.rotation}deg)`,
    };
  }

  return (
    <section
      className="canvas-shell"
      ref={containerRef}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
    >
      <div className="canvas-wrap">
        <div className="canvas-stage">
          <div
            className="canvas-stage-frame"
            style={{
              width: `${Math.round(width * scale)}px`,
              height: `${Math.round(height * scale)}px`,
            }}
          >
            <div
              className="canvas-stage-inner"
              style={{
                width: `${width}px`,
                height: `${height}px`,
                transform: `scale(${scale})`,
              }}
            >
              <Stage
                ref={stageRef}
                width={width}
                height={height}
                onMouseDown={onCanvasMouseDown}
                onTouchStart={onCanvasMouseDown}
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
                        hitStrokeWidth={layer.kind === 'overlay' ? 36 : 20}
                        dragBoundFunc={(position) =>
                          layer.kind === 'overlay' || dragArmedImageId === layer.id
                            ? position
                            : {
                                x: layer.x,
                                y: layer.y,
                              }
                        }
                        crop={{
                          x: (layer.crop.x / 100) * layer.naturalWidth,
                          y: (layer.crop.y / 100) * layer.naturalHeight,
                          width: (layer.crop.width / 100) * layer.naturalWidth,
                          height: (layer.crop.height / 100) * layer.naturalHeight,
                        }}
                        onClick={() =>
                          layer.kind === 'overlay' ? onSelectLayer(layer.id) : onTapImageLayer(layer.id)
                        }
                        onTap={() =>
                          layer.kind === 'overlay' ? onSelectLayer(layer.id) : onTapImageLayer(layer.id)
                        }
                        onDblClick={() => {
                          if (layer.kind !== 'overlay') {
                            onArmImageDrag(layer.id);
                          }
                        }}
                        onDblTap={() => {
                          if (layer.kind !== 'overlay') {
                            onArmImageDrag(layer.id);
                          }
                        }}
                        onDragStart={(event) => {
                          if (layer.kind === 'overlay') {
                            onSelectLayer(layer.id);
                            return;
                          }

                          if (dragArmedImageId === layer.id) {
                            return;
                          }

                          event.target.stopDrag();
                          event.target.position({
                            x: layer.x,
                            y: layer.y,
                          });
                          onSelectLayer(layer.id);
                        }}
                        onDragEnd={(event) => onDragEnd(layer.id, event)}
                        onTransformEnd={(event) => onTransform(layer.id, event)}
                        ref={(node) => {
                          if (node) {
                            nodeRefs.current[layer.id] = node;
                          }
                        }}
                      />
                    ) : (
                      <Group
                        key={layer.id}
                        x={layer.x}
                        y={layer.y}
                        width={layer.width}
                        height={layer.height}
                        draggable
                        rotation={layer.rotation}
                        opacity={editingTextLayerId === layer.id ? 0 : 1}
                        onTransform={(event) => onTransform(layer.id, event)}
                        onClick={() => onSelectLayer(layer.id)}
                        onTap={() => onSelectLayer(layer.id)}
                        onDblClick={() => openInlineEditor(layer.id)}
                        onDblTap={() => openInlineEditor(layer.id)}
                        onDragEnd={(event) => onDragEnd(layer.id, event)}
                        onTransformEnd={(event) => onTransform(layer.id, event)}
                        ref={(node) => {
                          if (node) {
                            nodeRefs.current[layer.id] = node;
                          }
                        }}
                      >
                        {buildTextHighlightRects(layer).map((rect, index) => (
                          <Rect
                            key={`${layer.id}-highlight-${index}`}
                            x={rect.x}
                            y={rect.y}
                            width={rect.width}
                            height={rect.height}
                            cornerRadius={rect.cornerRadius}
                            fill={layer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR}
                          />
                        ))}
                        <Text
                          x={0}
                          y={0}
                          text={layer.text}
                          width={layer.width}
                          height={layer.height}
                          fontFamily={layer.fontFamily}
                          fontStyle={layer.fontStyle ?? 'normal'}
                          fontSize={layer.fontSize}
                          fill={layer.color}
                          align={layer.align}
                          letterSpacing={layer.letterSpacing ?? 0}
                          lineHeight={layer.lineHeight}
                          wrap="word"
                        />
                      </Group>
                    ),
                  )}
                  <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    ignoreStroke
                    borderStroke="#d9683c"
                    borderStrokeWidth={2.5}
                    borderDash={[10, 6]}
                    anchorFill="#fff8f0"
                    anchorStroke="#9f4625"
                    anchorStrokeWidth={2}
                    anchorSize={22}
                    anchorCornerRadius={999}
                    rotateAnchorOffset={34}
                    padding={14}
                    keepRatio={selectedLayer?.type === 'image'}
                    enabledAnchors={
                      selectedLayer?.type === 'text'
                        ? [
                            'top-center',
                            'middle-left',
                            'middle-right',
                            'bottom-center',
                          ]
                        : undefined
                    }
                  />
                </KonvaLayer>
              </Stage>
            </div>
          </div>

          {selectedTextLayer && selectionToolbarStyle && !isEditingSelectedText ? (
            <>
              <div className="text-selection-toolbar" style={selectionToolbarStyle}>
                <button
                  type="button"
                  className={`text-selection-button${isTextToolsOpen ? ' text-selection-button--active' : ''}`}
                  onClick={onToggleTextTools}
                  aria-label="Открыть быстрые настройки текста"
                >
                  Aa
                </button>
                <button
                  type="button"
                  className="text-selection-button text-selection-button--danger"
                  onClick={onDeleteSelected}
                  aria-label="Удалить выбранный текст"
                >
                  ×
                </button>
              </div>

              {isTextToolsOpen && selectionPopoverStyle ? (
                <div className="text-selection-popover" style={selectionPopoverStyle}>
                  <button
                    type="button"
                    className="secondary text-selection-edit-button"
                    onClick={() => openInlineEditor(selectedTextLayer.id)}
                  >
                    Изменить текст
                  </button>

                  <label className="text-selection-field">
                    <span>Шрифт</span>
                    <FontPicker
                      value={selectedTextLayer.fontFamily}
                      fontOptions={fontOptions}
                      uploadedFonts={uploadedFonts}
                      compact
                      ariaLabel="Открыть меню шрифтов рядом с текстом"
                      onSelectFont={(family) =>
                        onQuickTextStyleChange({
                          fontFamily: family,
                        })
                      }
                      onDeleteUploadedFont={onDeleteUploadedFont}
                    />
                  </label>

                  <div className="text-selection-field">
                    <span>Выравнивание</span>
                    <div className="text-selection-align-row">
                      {([
                        ['left', 'Слева'],
                        ['center', 'Центр'],
                        ['right', 'Справа'],
                      ] as const).map(([align, label]) => (
                        <button
                          key={align}
                          type="button"
                          className={`ghost text-selection-align-button${
                            selectedTextLayer.align === align
                              ? ' text-selection-align-button--active'
                              : ''
                          }`}
                          onClick={() =>
                            onQuickTextStyleChange({
                              align,
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-selection-field">
                    <span>Плашка</span>
                    <div className="text-selection-highlight-row">
                      <button
                        type="button"
                        className={`ghost text-selection-highlight-button${
                          selectedTextLayer.backgroundEnabled
                            ? ' text-selection-highlight-button--active'
                            : ''
                        }`}
                        onClick={() =>
                          onQuickTextStyleChange({
                            backgroundEnabled: !selectedTextLayer.backgroundEnabled,
                            backgroundColor:
                              selectedTextLayer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR,
                          })
                        }
                      >
                        {selectedTextLayer.backgroundEnabled ? 'Вкл' : 'Выкл'}
                      </button>
                      <input
                        type="color"
                        value={selectedTextLayer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR}
                        disabled={!selectedTextLayer.backgroundEnabled}
                        onChange={(event) =>
                          onQuickTextStyleChange({
                            backgroundColor: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="text-selection-field">
                    <span>Размер</span>
                    <div className="text-selection-stepper">
                      <button
                        type="button"
                        className="ghost text-selection-stepper-button"
                        onClick={() =>
                          onQuickTextStyleChange({
                            fontSize: Math.max(14, selectedTextLayer.fontSize - 4),
                          })
                        }
                      >
                        A-
                      </button>
                      <strong>{selectedTextLayer.fontSize}px</strong>
                      <button
                        type="button"
                        className="ghost text-selection-stepper-button"
                        onClick={() =>
                          onQuickTextStyleChange({
                            fontSize: Math.min(220, selectedTextLayer.fontSize + 4),
                          })
                        }
                      >
                        A+
                      </button>
                    </div>
                  </div>

                  <div className="text-selection-field">
                    <span>Интервал</span>
                    <div className="text-selection-stepper">
                      <button
                        type="button"
                        className="ghost text-selection-stepper-button"
                        onClick={() =>
                          onQuickTextStyleChange({
                            lineHeight: Math.max(0.8, Number((selectedTextLayer.lineHeight - 0.05).toFixed(2))),
                          })
                        }
                      >
                        L-
                      </button>
                      <strong>{selectedTextLayer.lineHeight.toFixed(2)}</strong>
                      <button
                        type="button"
                        className="ghost text-selection-stepper-button"
                        onClick={() =>
                          onQuickTextStyleChange({
                            lineHeight: Math.min(2.4, Number((selectedTextLayer.lineHeight + 0.05).toFixed(2))),
                          })
                        }
                      >
                        L+
                      </button>
                    </div>
                  </div>

                  <label className="text-selection-field text-selection-field--color">
                    <span>Цвет</span>
                    <input
                      type="color"
                      value={selectedTextLayer.color}
                      onChange={(event) =>
                        onQuickTextStyleChange({
                          color: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}

            </>
          ) : null}

          {selectedTextLayer && isEditingSelectedText && inlineEditorStyle ? (
            <div className="text-inline-editor" style={inlineEditorStyle}>
              <textarea
                ref={textEditorRef}
                className="text-inline-editor-input"
                value={selectedTextLayer.text}
                style={{
                  fontFamily: selectedTextLayer.fontFamily,
                  fontSize: `${Math.max(selectedTextLayer.fontSize * scale, 14)}px`,
                  lineHeight: String(selectedTextLayer.lineHeight),
                  color: selectedTextLayer.color,
                  textAlign: selectedTextLayer.align,
                  letterSpacing: `${(selectedTextLayer.letterSpacing ?? 0) * scale}px`,
                  fontStyle: selectedTextLayer.fontStyle?.includes('italic') ? 'italic' : 'normal',
                  fontWeight: selectedTextLayer.fontStyle?.includes('bold') ? 700 : 500,
                }}
                onChange={(event) => onInlineTextChange(selectedTextLayer.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onStopEditingText();
                  }

                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    onStopEditingText();
                  }
                }}
              />
              <button
                type="button"
                className="text-inline-editor-done"
                onClick={onStopEditingText}
              >
                Готово
              </button>
            </div>
          ) : null}
        </div>

        {!isCompactPreview && !isFullscreenCanvas ? (
          <p className="hint">
            {layers.length === 0
              ? `Пустая канва ${width} x ${height}. Перетащите фото сюда, вставьте из буфера или нажмите “Загрузить фото”.`
              : selectedLayer?.type === 'image' && selectedLayer.kind === 'overlay'
                ? `${width} x ${height} · ${Math.round(scale * 100)}% · стикер можно сразу тянуть за любое место, рамка и точки увеличены для пальца.`
              : selectedLayer?.type === 'image' && dragArmedImageId === selectedLayer.id
                ? `${width} x ${height} · ${Math.round(scale * 100)}% · фото разблокировано для перемещения, после drag блокировка вернётся.`
                : selectedLayer?.type === 'image'
                  ? `${width} x ${height} · ${Math.round(scale * 100)}% · первый тап выделяет фото, второй тап или double tap включает перемещение.`
                  : `${width} x ${height} · ${Math.round(scale * 100)}% · кликните по пустой области, чтобы снять выделение.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
