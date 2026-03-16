import { CSSProperties, useEffect, useRef } from 'react';

import { Layer, TextLayer } from '../editor/types';
import { Stage, Layer as KonvaLayer, Text, Transformer, Image as KonvaImage } from 'react-konva';
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
  dragArmedImageId: string | null;
  isTextToolsOpen: boolean;
  editingTextLayerId: string | null;
  onCanvasMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onSelectLayer: (id: string) => void;
  onTapImageLayer: (id: string) => void;
  onArmImageDrag: (id: string) => void;
  onToggleTextTools: () => void;
  onQuickTextStyleChange: (changes: {
    fontSize?: number;
    lineHeight?: number;
    color?: string;
  }) => void;
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
  dragArmedImageId,
  isTextToolsOpen,
  editingTextLayerId,
  onCanvasMouseDown,
  onSelectLayer,
  onTapImageLayer,
  onArmImageDrag,
  onToggleTextTools,
  onQuickTextStyleChange,
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

    textEditorRef.current.focus();
    textEditorRef.current.setSelectionRange(
      textEditorRef.current.value.length,
      textEditorRef.current.value.length,
    );
  }, [isEditingSelectedText, selectedTextLayer?.id]);

  let selectionToolbarStyle: CSSProperties | undefined;
  let selectionPopoverStyle: CSSProperties | undefined;
  let inlineEditorStyle: CSSProperties | undefined;

  if (selectedTextLayer) {
    const toolbarWidth = 92;
    const popoverWidth = Math.min(248, frameWidth - 16);
    const toolbarLeft = clampToFrame(
      (selectedTextLayer.x + selectedTextLayer.width) * scale - toolbarWidth,
      8,
      Math.max(8, frameWidth - toolbarWidth - 8),
    );
    const toolbarTop = clampToFrame(
      selectedTextLayer.y * scale - 48,
      8,
      Math.max(8, frameHeight - 44),
    );
    const popoverLeft = clampToFrame(
      (selectedTextLayer.x + selectedTextLayer.width) * scale - popoverWidth,
      8,
      Math.max(8, frameWidth - popoverWidth - 8),
    );
    const popoverTop = clampToFrame(
      toolbarTop + 44,
      8,
      Math.max(8, frameHeight - 190),
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
                        dragBoundFunc={(position) =>
                          dragArmedImageId === layer.id
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
                        onClick={() => onTapImageLayer(layer.id)}
                        onTap={() => onTapImageLayer(layer.id)}
                        onDblClick={() => onArmImageDrag(layer.id)}
                        onDblTap={() => onArmImageDrag(layer.id)}
                        onDragStart={(event) => {
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
                        fontStyle={layer.fontStyle ?? 'normal'}
                        fontSize={layer.fontSize}
                        fill={layer.color}
                        opacity={editingTextLayerId === layer.id ? 0 : 1}
                        align={layer.align}
                        letterSpacing={layer.letterSpacing ?? 0}
                        lineHeight={layer.lineHeight}
                        wrap="word"
                        onTransform={(event) => onTransform(layer.id, event)}
                        onClick={() => onSelectLayer(layer.id)}
                        onTap={() => onSelectLayer(layer.id)}
                        onDblClick={() => onStartEditingText(layer.id)}
                        onDblTap={() => onStartEditingText(layer.id)}
                        onDragEnd={(event) => onDragEnd(layer.id, event)}
                        onTransformEnd={(event) => onTransform(layer.id, event)}
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
                    borderStroke="#d9683c"
                    borderStrokeWidth={2}
                    borderDash={[10, 6]}
                    anchorFill="#fff8f0"
                    anchorStroke="#9f4625"
                    anchorStrokeWidth={2}
                    anchorSize={14}
                    anchorCornerRadius={999}
                    rotateAnchorOffset={28}
                    padding={10}
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

          {selectedTextLayer && selectionToolbarStyle ? (
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
                    onClick={() => onStartEditingText(selectedTextLayer.id)}
                  >
                    Изменить текст
                  </button>

                  <label className="text-selection-field">
                    <span>Размер</span>
                    <strong>{selectedTextLayer.fontSize}px</strong>
                    <input
                      type="range"
                      min="14"
                      max="220"
                      value={selectedTextLayer.fontSize}
                      onChange={(event) =>
                        onQuickTextStyleChange({
                          fontSize: Number(event.target.value),
                        })
                      }
                    />
                  </label>

                  <label className="text-selection-field">
                    <span>Интервал</span>
                    <strong>{selectedTextLayer.lineHeight.toFixed(2)}</strong>
                    <input
                      type="range"
                      min="0.8"
                      max="2.4"
                      step="0.05"
                      value={selectedTextLayer.lineHeight}
                      onChange={(event) =>
                        onQuickTextStyleChange({
                          lineHeight: Number(event.target.value),
                        })
                      }
                    />
                  </label>

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

              {isEditingSelectedText && inlineEditorStyle ? (
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
            </>
          ) : null}
        </div>

        {!isCompactPreview ? (
          <p className="hint">
            {layers.length === 0
              ? `Пустая канва ${width} x ${height}. Перетащите фото сюда, вставьте из буфера или нажмите “Загрузить фото”.`
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
