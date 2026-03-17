import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { FontPicker } from './FontPicker';
import {
  Layer,
  TextAlign,
  TextBackgroundStyle,
  TextLayer,
  UploadedFont,
} from '../editor/types';
import {
  buildTextHighlightBlock,
  buildTextHighlightRects,
  DEFAULT_TEXT_BACKGROUND_COLOR,
  DEFAULT_TEXT_BACKGROUND_STYLE,
  TEXT_BACKGROUND_STYLE_OPTIONS,
  withAlpha,
} from '../editor/textHighlight';
import { FontOption } from '../editor/textPresets';
import {
  Stage,
  Layer as KonvaLayer,
  Text,
  Transformer,
  Image as KonvaImage,
  Group,
  Rect,
} from 'react-konva';
import Konva from 'konva';
import { DragEvent, MutableRefObject, RefObject } from 'react';

function isTextLayer(layer: Layer | null): layer is TextLayer {
  return layer?.type === 'text';
}

function clampToFrame(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type SelectionMetrics = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function areSelectionMetricsEqual(
  left: SelectionMetrics | null,
  right: SelectionMetrics | null,
) {
  if (!left || !right) {
    return left === right;
  }

  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.right - right.right) < 0.5 &&
    Math.abs(left.bottom - right.bottom) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
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
    backgroundStyle?: TextBackgroundStyle;
  }) => void;
  onMoveSelectedLayerToEdge: (edge: 'back' | 'front') => void;
  canSendSelectedLayerToBack: boolean;
  canBringSelectedLayerToFront: boolean;
  onDeleteUploadedFont: (fontId: string) => void;
  onDeleteSelected: () => void;
  onRequestSavePreview: () => void;
  isPreparingSavePreview: boolean;
  isSavePreviewOpen: boolean;
  onStartEditingText: (id: string) => void;
  onStopEditingText: () => void;
  onInlineTextChange: (id: string, value: string) => void;
  onDragEnd: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransform: (id: string, event: Konva.KonvaEventObject<Event>) => void;
  onDismissWorkspaceUi: () => void;
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
  onMoveSelectedLayerToEdge,
  canSendSelectedLayerToBack,
  canBringSelectedLayerToFront,
  onDeleteUploadedFont,
  onDeleteSelected,
  onRequestSavePreview,
  isPreparingSavePreview,
  isSavePreviewOpen,
  onStartEditingText,
  onStopEditingText,
  onInlineTextChange,
  onDragEnd,
  onTransform,
  onDismissWorkspaceUi,
  transformerRef,
  nodeRefs,
  stageRef,
  containerRef,
  onDropFiles,
}: EditorCanvasProps) {
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedCanvasLayer = selectedLayer;
  const selectedTextLayer = isTextLayer(selectedLayer) ? selectedLayer : null;
  const [selectionMetrics, setSelectionMetrics] = useState<SelectionMetrics | null>(null);

  const readSelectionMetrics = (layer: Layer | null) => {
    if (!layer) {
      return null;
    }

    const node = nodeRefs.current[layer.id];
    if (node) {
      const rect = node.getClientRect({
        skipShadow: true,
        skipStroke: true,
      });

      return {
        left: rect.x * scale,
        top: rect.y * scale,
        right: (rect.x + rect.width) * scale,
        bottom: (rect.y + rect.height) * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      };
    }

    return {
      left: layer.x * scale,
      top: layer.y * scale,
      right: (layer.x + layer.width) * scale,
      bottom: (layer.y + layer.height) * scale,
      width: layer.width * scale,
      height: layer.height * scale,
    };
  };

  const syncSelectionMetrics = (layer: Layer | null = selectedCanvasLayer) => {
    const nextMetrics = readSelectionMetrics(layer);
    setSelectionMetrics((current) =>
      areSelectionMetricsEqual(current, nextMetrics) ? current : nextMetrics,
    );
  };

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

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const cancelLongPress = () => {
    clearLongPressTimer();
    longPressStartRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== 'touch' ||
      isPreparingSavePreview ||
      isSavePreviewOpen ||
      layers.length === 0
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest('.konvajs-content')) {
      return;
    }

    longPressTriggeredRef.current = false;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onRequestSavePreview();
    }, 320);
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!longPressStartRef.current || longPressTriggeredRef.current) {
      return;
    }

    const deltaX = event.clientX - longPressStartRef.current.x;
    const deltaY = event.clientY - longPressStartRef.current.y;
    if (Math.hypot(deltaX, deltaY) > 10) {
      cancelLongPress();
    }
  };

  const handleStagePointerUp = () => {
    cancelLongPress();
  };

  const handleShellPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (
      target.closest('.canvas-stage-frame') ||
      target.closest('.text-selection-toolbar') ||
      target.closest('.text-selection-popover') ||
      target.closest('.text-inline-editor')
    ) {
      return;
    }

    onDismissWorkspaceUi();
  };

  const isEditingSelectedText = Boolean(
    selectedTextLayer && editingTextLayerId === selectedTextLayer.id,
  );
  const frameWidth = Math.round(width * scale);
  const frameHeight = Math.round(height * scale);

  useEffect(() => {
    if (!selectedCanvasLayer) {
      setSelectionMetrics(null);
      return;
    }

    syncSelectionMetrics(selectedCanvasLayer);
  }, [
    scale,
    selectedCanvasLayer,
    selectedCanvasLayer?.height,
    selectedCanvasLayer?.id,
    selectedCanvasLayer?.rotation,
    selectedCanvasLayer?.width,
    selectedCanvasLayer?.x,
    selectedCanvasLayer?.y,
  ]);

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
  const estimatedPopoverHeight = 520;

  if (selectedCanvasLayer) {
    const resolvedSelectionMetrics = selectionMetrics ?? readSelectionMetrics(selectedCanvasLayer);
    if (resolvedSelectionMetrics) {
      const toolbarButtonCount = selectedTextLayer ? 4 : 2;
      const toolbarWidth = toolbarButtonCount * 30 + (toolbarButtonCount - 1) * 4;
      const toolbarHeight = 30;
      const popoverWidth = Math.min(228, frameWidth - 12);
      const selectionTop = resolvedSelectionMetrics.top;
      const selectionRight = resolvedSelectionMetrics.right;
      const selectionBottom = resolvedSelectionMetrics.bottom;
      const toolbarLeft = clampToFrame(
        selectionRight - toolbarWidth + 10,
        6,
        Math.max(6, frameWidth - toolbarWidth - 6),
      );
      const toolbarTop = clampToFrame(
        selectionTop - 12,
        6,
        Math.max(6, frameHeight - toolbarHeight - 6),
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
    }

    if (selectedTextLayer) {
      inlineEditorStyle = {
        left: `${selectedTextLayer.x * scale}px`,
        top: `${selectedTextLayer.y * scale}px`,
        width: `${Math.max(selectedTextLayer.width * scale, 140)}px`,
        height: `${Math.max(selectedTextLayer.height * scale, 88)}px`,
        transform: `rotate(${selectedTextLayer.rotation}deg)`,
      };
    }
  }

  return (
    <section
      className="canvas-shell"
      ref={containerRef}
      onPointerDown={handleShellPointerDown}
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
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerCancel={handleStagePointerUp}
            onPointerLeave={handleStagePointerUp}
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
                        onClick={() => {
                          if (layer.kind === 'overlay') {
                            onSelectLayer(layer.id);
                          } else {
                            onTapImageLayer(layer.id);
                          }

                          syncSelectionMetrics(layer);
                        }}
                        onTap={() => {
                          if (layer.kind === 'overlay') {
                            onSelectLayer(layer.id);
                          } else {
                            onTapImageLayer(layer.id);
                          }

                          syncSelectionMetrics(layer);
                        }}
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
                            syncSelectionMetrics(layer);
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
                          syncSelectionMetrics(layer);
                        }}
                        onDragMove={() => syncSelectionMetrics(layer)}
                        onDragEnd={(event) => {
                          syncSelectionMetrics(layer);
                          onDragEnd(layer.id, event);
                        }}
                        onTransform={() => syncSelectionMetrics(layer)}
                        onTransformEnd={(event) => {
                          syncSelectionMetrics(layer);
                          onTransform(layer.id, event);
                        }}
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
                        onTransform={(event) => {
                          onTransform(layer.id, event);
                          syncSelectionMetrics(layer);
                        }}
                        onClick={() => {
                          onSelectLayer(layer.id);
                          syncSelectionMetrics(layer);
                        }}
                        onTap={() => {
                          onSelectLayer(layer.id);
                          syncSelectionMetrics(layer);
                        }}
                        onDblClick={() => openInlineEditor(layer.id)}
                        onDblTap={() => openInlineEditor(layer.id)}
                        onDragMove={() => syncSelectionMetrics(layer)}
                        onDragEnd={(event) => {
                          syncSelectionMetrics(layer);
                          onDragEnd(layer.id, event);
                        }}
                        onTransformEnd={(event) => {
                          syncSelectionMetrics(layer);
                          onTransform(layer.id, event);
                        }}
                        ref={(node) => {
                          if (node) {
                            nodeRefs.current[layer.id] = node;
                          }
                        }}
                      >
                        {buildTextHighlightRects(layer).map((rect, index) => {
                          const backgroundStyle =
                            layer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE;
                          const backgroundColor =
                            layer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR;
                          const blockRect =
                            backgroundStyle === 'block' || backgroundStyle === 'frame'
                              ? buildTextHighlightBlock(layer)
                              : null;

                          if (blockRect && index === 0) {
                            return (
                              <Group key={`${layer.id}-highlight-${index}`} listening={false}>
                                <Rect
                                  x={blockRect.x + (backgroundStyle === 'frame' ? 8 : 6)}
                                  y={blockRect.y + (backgroundStyle === 'frame' ? 8 : 6)}
                                  width={Math.max(24, blockRect.width - (backgroundStyle === 'frame' ? 12 : 10))}
                                  height={Math.max(24, blockRect.height - (backgroundStyle === 'frame' ? 12 : 10))}
                                  cornerRadius={Math.max(14, blockRect.cornerRadius - 6)}
                                  fill={withAlpha(backgroundColor, backgroundStyle === 'frame' ? 0.24 : 0.34)}
                                />
                                <Rect
                                  x={blockRect.x}
                                  y={blockRect.y}
                                  width={blockRect.width}
                                  height={blockRect.height}
                                  cornerRadius={blockRect.cornerRadius}
                                  fill={backgroundColor}
                                  shadowColor={withAlpha(backgroundColor, 0.34)}
                                  shadowBlur={backgroundStyle === 'frame' ? 14 : 18}
                                  shadowOpacity={backgroundStyle === 'frame' ? 0.2 : 0.24}
                                />
                                {backgroundStyle === 'frame' ? (
                                  <Rect
                                    x={blockRect.x + 8}
                                    y={blockRect.y + 8}
                                    width={Math.max(12, blockRect.width - 16)}
                                    height={Math.max(12, blockRect.height - 16)}
                                    cornerRadius={Math.max(12, blockRect.cornerRadius - 8)}
                                    fill={withAlpha(backgroundColor, 0.12)}
                                    stroke="rgba(255, 248, 240, 0.74)"
                                    strokeWidth={1.5}
                                  />
                                ) : null}
                              </Group>
                            );
                          }

                          if (blockRect) {
                            return null;
                          }

                          if (backgroundStyle === 'cloud') {
                            return (
                              <Group key={`${layer.id}-highlight-${index}`} listening={false}>
                                <Rect
                                  x={rect.x - 4}
                                  y={rect.y - 3}
                                  width={rect.width + 8}
                                  height={rect.height + 6}
                                  cornerRadius={rect.cornerRadius + 8}
                                  fill={withAlpha(backgroundColor, 0.22)}
                                />
                                <Rect
                                  x={rect.x}
                                  y={rect.y}
                                  width={rect.width}
                                  height={rect.height}
                                  cornerRadius={rect.cornerRadius}
                                  fill={backgroundColor}
                                  shadowColor={withAlpha(backgroundColor, 0.34)}
                                  shadowBlur={14}
                                  shadowOpacity={0.26}
                                />
                              </Group>
                            );
                          }

                          if (backgroundStyle === 'sticker') {
                            const offsetX = index % 2 === 0 ? 6 : 4;
                            const offsetY = index % 2 === 0 ? 5 : 7;
                            return (
                              <Group key={`${layer.id}-highlight-${index}`} listening={false}>
                                <Rect
                                  x={rect.x + offsetX}
                                  y={rect.y + offsetY}
                                  width={rect.width}
                                  height={rect.height}
                                  cornerRadius={Math.max(14, rect.cornerRadius - 2)}
                                  fill={withAlpha(backgroundColor, 0.3)}
                                />
                                <Rect
                                  x={rect.x}
                                  y={rect.y}
                                  width={rect.width}
                                  height={rect.height}
                                  cornerRadius={rect.cornerRadius}
                                  fill={backgroundColor}
                                  shadowColor={withAlpha(backgroundColor, 0.28)}
                                  shadowBlur={10}
                                  shadowOpacity={0.2}
                                />
                                <Rect
                                  x={rect.x + 6}
                                  y={rect.y + 5}
                                  width={Math.max(12, rect.width - 12)}
                                  height={Math.max(12, rect.height - 10)}
                                  cornerRadius={Math.max(12, rect.cornerRadius - 6)}
                                  fill={withAlpha('#fff8f0', 0.12)}
                                />
                              </Group>
                            );
                          }

                          return (
                            <Rect
                              key={`${layer.id}-highlight-${index}`}
                              x={rect.x}
                              y={rect.y}
                              width={rect.width}
                              height={rect.height}
                              cornerRadius={rect.cornerRadius}
                              fill={backgroundColor}
                              shadowColor={
                                backgroundStyle === 'soft'
                                  ? withAlpha(backgroundColor, 0.3)
                                  : undefined
                              }
                              shadowBlur={backgroundStyle === 'soft' ? 10 : 0}
                              shadowOpacity={backgroundStyle === 'soft' ? 0.24 : 0}
                              listening={false}
                            />
                          );
                        })}
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

          {selectedCanvasLayer && selectionToolbarStyle && !isEditingSelectedText ? (
            <>
              <div className="text-selection-toolbar" style={selectionToolbarStyle}>
                <button
                  type="button"
                  className="text-selection-button"
                  onClick={() => onMoveSelectedLayerToEdge('back')}
                  aria-label="Перенести слой в самый низ"
                  disabled={!canSendSelectedLayerToBack}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="text-selection-button"
                  onClick={() => onMoveSelectedLayerToEdge('front')}
                  aria-label="Перенести слой в самый верх"
                  disabled={!canBringSelectedLayerToFront}
                >
                  ↑
                </button>
                {selectedTextLayer ? (
                  <>
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
                  </>
                ) : null}
              </div>

              {selectedTextLayer && isTextToolsOpen && selectionPopoverStyle ? (
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
                            backgroundStyle:
                              selectedTextLayer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE,
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
                    <span>Стиль плашки</span>
                    <div className="text-highlight-style-grid text-highlight-style-grid--compact">
                      {TEXT_BACKGROUND_STYLE_OPTIONS.map((style) => (
                        <button
                          key={style.id}
                          type="button"
                          className={`ghost text-highlight-style-button${
                            (selectedTextLayer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE) ===
                            style.id
                              ? ' text-highlight-style-button--active'
                              : ''
                          }`}
                          disabled={!selectedTextLayer.backgroundEnabled}
                          onClick={() =>
                            onQuickTextStyleChange({
                              backgroundStyle: style.id,
                            })
                          }
                        >
                          {style.label}
                        </button>
                      ))}
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
                ? `${width} x ${height} · ${Math.round(scale * 100)}% · стикер можно сразу тянуть за любое место, рамка и точки увеличены для пальца. Долгое удержание по канве откроет сохранение изображения.`
              : selectedLayer?.type === 'image' && dragArmedImageId === selectedLayer.id
                ? `${width} x ${height} · ${Math.round(scale * 100)}% · фото разблокировано для перемещения, после drag блокировка вернётся. Долгое удержание по канве откроет сохранение изображения.`
                : selectedLayer?.type === 'image'
                  ? `${width} x ${height} · ${Math.round(scale * 100)}% · первый тап выделяет фото, второй тап или double tap включает перемещение. Долгое удержание по канве откроет сохранение изображения.`
                  : `${width} x ${height} · ${Math.round(scale * 100)}% · кликните по пустой области, чтобы снять выделение. Долгое удержание по канве откроет сохранение изображения.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
