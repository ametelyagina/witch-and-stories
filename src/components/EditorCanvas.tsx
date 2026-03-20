import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import { FontPicker } from './FontPicker';
import {
  CompositionMode,
  Layer,
  TextAlign,
  TextBackgroundStyle,
  TextLayer,
  UploadedFont,
} from '../editor/types';
import { CollageSlot } from '../editor/collage';
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

type CornerRadiusValue = number | [number, number, number, number];

function normalizeCornerRadius(
  cornerRadius: CornerRadiusValue,
  width: number,
  height: number,
): [number, number, number, number] {
  const radii = typeof cornerRadius === 'number'
    ? [cornerRadius, cornerRadius, cornerRadius, cornerRadius]
    : cornerRadius;
  const maxRadius = Math.max(0, Math.min(width, height) / 2);

  return radii.map((value) => clampToFrame(value, 0, maxRadius)) as [
    number,
    number,
    number,
    number,
  ];
}

function insetCornerRadius(cornerRadius: CornerRadiusValue, inset: number): CornerRadiusValue {
  if (inset <= 0) {
    return cornerRadius;
  }

  if (typeof cornerRadius === 'number') {
    return Math.max(0, cornerRadius - inset);
  }

  return cornerRadius.map((value) => Math.max(0, value - inset)) as [
    number,
    number,
    number,
    number,
  ];
}

function drawRoundedRectPath(
  context: Konva.Context,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: CornerRadiusValue,
) {
  const [topLeft, topRight, bottomRight, bottomLeft] = normalizeCornerRadius(
    cornerRadius,
    width,
    height,
  );

  context.beginPath();
  context.moveTo(x + topLeft, y);
  context.lineTo(x + width - topRight, y);
  if (topRight > 0) {
    context.arcTo(x + width, y, x + width, y + topRight, topRight);
  } else {
    context.lineTo(x + width, y);
  }

  context.lineTo(x + width, y + height - bottomRight);
  if (bottomRight > 0) {
    context.arcTo(x + width, y + height, x + width - bottomRight, y + height, bottomRight);
  } else {
    context.lineTo(x + width, y + height);
  }

  context.lineTo(x + bottomLeft, y + height);
  if (bottomLeft > 0) {
    context.arcTo(x, y + height, x, y + height - bottomLeft, bottomLeft);
  } else {
    context.lineTo(x, y + height);
  }

  context.lineTo(x, y + topLeft);
  if (topLeft > 0) {
    context.arcTo(x, y, x + topLeft, y, topLeft);
  } else {
    context.lineTo(x, y);
  }
  context.closePath();
}

type EditorCanvasProps = {
  stageRef: RefObject<Konva.Stage | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  layers: Layer[];
  width: number;
  height: number;
  stageViewportWidth: number;
  stageViewportHeight: number;
  canvasOffsetX: number;
  canvasOffsetY: number;
  scale: number;
  selectedLayer: Layer | null;
  compositionMode: CompositionMode;
  collageSlots: CollageSlot[];
  filledCollageSlotIds: string[];
  collageSpacing: number;
  collageDividersEnabled: boolean;
  collageCornerRadius: number;
  isCompactPreview: boolean;
  isFullscreenCanvas: boolean;
  fullscreenZoom: number;
  fullscreenPan: {
    x: number;
    y: number;
  };
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
  onPinchExpand: () => void;
  onPinchZoom: (nextState: { zoom: number; panX: number; panY: number }) => void;
  onPinchCollapse: () => void;
  onStartEditingText: (id: string) => void;
  onStopEditingText: () => void;
  onInlineTextChange: (id: string, value: string) => void;
  onDragEnd: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransform: (id: string, event: Konva.KonvaEventObject<Event>) => void;
  onRestoreLayerGeometry: (
    id: string,
    geometry: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  ) => void;
  onDismissWorkspaceUi: () => void;
  transformerRef: RefObject<Konva.Transformer | null>;
  nodeRefs: MutableRefObject<Record<string, Konva.Node>>;
  onDropFiles: (files: File[]) => void;
};

export function EditorCanvas({
  layers,
  width,
  height,
  stageViewportWidth,
  stageViewportHeight,
  canvasOffsetX,
  canvasOffsetY,
  scale,
  selectedLayer,
  compositionMode,
  collageSlots,
  filledCollageSlotIds,
  collageSpacing,
  collageDividersEnabled,
  collageCornerRadius,
  isCompactPreview,
  isFullscreenCanvas,
  fullscreenZoom,
  fullscreenPan,
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
  onPinchExpand,
  onPinchZoom,
  onPinchCollapse,
  onStartEditingText,
  onStopEditingText,
  onInlineTextChange,
  onDragEnd,
  onTransform,
  onRestoreLayerGeometry,
  onDismissWorkspaceUi,
  transformerRef,
  nodeRefs,
  stageRef,
  containerRef,
  onDropFiles,
}: EditorCanvasProps) {
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoSelectedEditorIdRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isMultiTouchActive, setIsMultiTouchActive] = useState(false);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const multiTouchFreezeRef = useRef(false);
  const cancelledInteractionLayerIdsRef = useRef<Set<string>>(new Set());
  const interactionOriginRef = useRef<
    Record<string, Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>>
  >({});
  const pinchActionLockRef = useRef<'expand' | 'collapse' | null>(null);
  const pinchGestureRef = useRef<{
    mode: 'compact' | 'fullscreen';
    startDistance: number;
    startZoom: number;
    anchorX: number;
    anchorY: number;
    shouldCollapse: boolean;
  } | null>(null);
  const touchPinchGestureRef = useRef<{
    mode: 'compact' | 'fullscreen';
    startDistance: number;
    startZoom: number;
    anchorX: number;
    anchorY: number;
    shouldCollapse: boolean;
  } | null>(null);
  const selectedCanvasLayer =
    selectedLayer?.type === 'image' && selectedLayer.kind === 'background' ? null : selectedLayer;
  const selectedTextLayer = isTextLayer(selectedLayer) ? selectedLayer : null;
  const isSelectedCollageLayer =
    selectedCanvasLayer?.type === 'image' && selectedCanvasLayer.kind === 'collage';
  const collageFilledSlotIds = new Set(filledCollageSlotIds);
  const isCollageSpacingless =
    compositionMode === 'collage' && (collageSpacing === 0 || !collageDividersEnabled);
  const hasVisibleCollageFrame = compositionMode === 'collage' && collageSpacing > 0;
  const collageBounds = collageSlots.length
    ? collageSlots.reduce(
        (bounds, slot) => ({
          left: Math.min(bounds.left, slot.x),
          top: Math.min(bounds.top, slot.y),
          right: Math.max(bounds.right, slot.x + slot.width),
          bottom: Math.max(bounds.bottom, slot.y + slot.height),
        }),
        {
          left: collageSlots[0].x,
          top: collageSlots[0].y,
          right: collageSlots[0].x + collageSlots[0].width,
          bottom: collageSlots[0].y + collageSlots[0].height,
        },
      )
    : null;
  const [selectionMetrics, setSelectionMetrics] = useState<SelectionMetrics | null>(null);
  const [isSelectionColorPicking, setIsSelectionColorPicking] = useState(false);
  const visualScale = isFullscreenCanvas ? scale * fullscreenZoom : scale;
  const viewportPanX = isFullscreenCanvas ? fullscreenPan.x : 0;
  const viewportPanY = isFullscreenCanvas ? fullscreenPan.y : 0;

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
        left: rect.x * visualScale + viewportPanX,
        top: rect.y * visualScale + viewportPanY,
        right: (rect.x + rect.width) * visualScale + viewportPanX,
        bottom: (rect.y + rect.height) * visualScale + viewportPanY,
        width: rect.width * visualScale,
        height: rect.height * visualScale,
      };
    }

    return {
      left: (canvasOffsetX + layer.x) * visualScale + viewportPanX,
      top: (canvasOffsetY + layer.y) * visualScale + viewportPanY,
      right: (canvasOffsetX + layer.x + layer.width) * visualScale + viewportPanX,
      bottom: (canvasOffsetY + layer.y + layer.height) * visualScale + viewportPanY,
      width: layer.width * visualScale,
      height: layer.height * visualScale,
    };
  };

  const syncSelectionMetrics = (layer: Layer | null = selectedCanvasLayer) => {
    const nextMetrics = readSelectionMetrics(layer);
    setSelectionMetrics((current) =>
      areSelectionMetricsEqual(current, nextMetrics) ? current : nextMetrics,
    );
  };

  const focusInlineEditor = ({ selectAll = false }: { selectAll?: boolean } = {}) => {
    const textarea = textEditorRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus({ preventScroll: true });
    const length = textarea.value.length;

    if (selectAll) {
      textarea.select();
      textarea.setSelectionRange(0, length);
      return;
    }

    textarea.setSelectionRange(length, length);
  };

  const openInlineEditor = (id: string) => {
    flushSync(() => {
      onStartEditingText(id);
    });

    requestAnimationFrame(() => {
      focusInlineEditor({ selectAll: true });
    });
  };

  const handleStartSelectionColorPicking = () => {
    setIsSelectionColorPicking(true);
  };

  const handleFinishSelectionColorPicking = () => {
    setIsSelectionColorPicking(false);
  };

  useEffect(() => {
    if (!selectedTextLayer || editingTextLayerId !== selectedTextLayer.id) {
      lastAutoSelectedEditorIdRef.current = null;
      return;
    }

    if (lastAutoSelectedEditorIdRef.current === selectedTextLayer.id) {
      return;
    }

    lastAutoSelectedEditorIdRef.current = selectedTextLayer.id;
    requestAnimationFrame(() => {
      focusInlineEditor({ selectAll: true });
    });
  }, [editingTextLayerId, selectedTextLayer]);

  useEffect(() => {
    if (!isSelectionColorPicking) {
      return;
    }

    const handleWindowFocus = () => {
      window.setTimeout(() => {
        setIsSelectionColorPicking(false);
      }, 0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSelectionColorPicking(false);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSelectionColorPicking]);

  useEffect(() => {
    if (!selectedTextLayer || !isTextToolsOpen) {
      setIsSelectionColorPicking(false);
    }
  }, [isTextToolsOpen, selectedTextLayer]);

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
    longPressTriggeredRef.current = false;
    longPressStartRef.current = null;
  };

  const releaseCapturedTouchPointers = () => {
    const frame = stageFrameRef.current;
    if (!frame) {
      return;
    }

    for (const pointerId of touchPointersRef.current.keys()) {
      try {
        frame.releasePointerCapture(pointerId);
      } catch {
        // Ignore stale or already released pointer captures.
      }
    }
  };

  const clearPinchState = () => {
    pinchGestureRef.current = null;
    touchPinchGestureRef.current = null;
    if (touchPointersRef.current.size === 0) {
      pinchActionLockRef.current = null;
    }
    setIsMultiTouchActive(false);
  };

  const resetTransientInteractionState = ({
    restoreSelectedLayer = false,
  }: {
    restoreSelectedLayer?: boolean;
  } = {}) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressStartRef.current = null;
    releaseCapturedTouchPointers();
    touchPointersRef.current.clear();
    multiTouchFreezeRef.current = false;
    pinchGestureRef.current = null;
    touchPinchGestureRef.current = null;
    pinchActionLockRef.current = null;
    setIsMultiTouchActive(false);

    if (restoreSelectedLayer) {
      stopSelectedLayerManipulation();
    }
  };

  const readPinchDistance = () => {
    const [first, second] = Array.from(touchPointersRef.current.values());
    if (!first || !second) {
      return 0;
    }

    return Math.hypot(second.x - first.x, second.y - first.y);
  };

  const readTouchPinchDistance = (touches: TouchList) => {
    if (touches.length < 2) {
      return 0;
    }

    const first = touches[0];
    const second = touches[1];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const readPinchCenter = (element: HTMLElement) => {
    const [first, second] = Array.from(touchPointersRef.current.values());
    if (!first || !second) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      x: (first.x + second.x) / 2 - rect.left,
      y: (first.y + second.y) / 2 - rect.top,
    };
  };

  const readTouchPinchCenter = (touches: TouchList, element: HTMLElement) => {
    if (touches.length < 2) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  };

  const clampFullscreenPan = (nextPanX: number, nextPanY: number, nextZoom: number) => {
    if (!isFullscreenCanvas || nextZoom <= 1) {
      return { x: 0, y: 0 };
    }

    const viewportWidth = stageViewportWidth * scale;
    const viewportHeight = stageViewportHeight * scale;
    const contentWidth = stageViewportWidth * scale * nextZoom;
    const contentHeight = stageViewportHeight * scale * nextZoom;

    return {
      x: clampToFrame(nextPanX, viewportWidth - contentWidth, 0),
      y: clampToFrame(nextPanY, viewportHeight - contentHeight, 0),
    };
  };

  const buildNextFullscreenTransform = (
    nextZoom: number,
    center: { x: number; y: number } | null,
    pinchGesture:
      | {
          anchorX: number;
          anchorY: number;
        }
      | null,
  ) => {
    if (!center || !pinchGesture) {
      return {
        zoom: nextZoom,
        panX: fullscreenPan.x,
        panY: fullscreenPan.y,
      };
    }

    const nextPanX = center.x - pinchGesture.anchorX * scale * nextZoom;
    const nextPanY = center.y - pinchGesture.anchorY * scale * nextZoom;
    const clampedPan = clampFullscreenPan(nextPanX, nextPanY, nextZoom);

    return {
      zoom: nextZoom,
      panX: clampedPan.x,
      panY: clampedPan.y,
    };
  };

  const isTwoFingerGestureActive = () =>
    multiTouchFreezeRef.current ||
    touchPointersRef.current.size >= 2 ||
    Boolean(pinchGestureRef.current) ||
    Boolean(touchPinchGestureRef.current);

  const rememberLayerInteractionOrigin = (layer: Layer) => {
    interactionOriginRef.current[layer.id] = {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
    };
  };

  const clearLayerInteractionOrigin = (layerId: string) => {
    delete interactionOriginRef.current[layerId];
  };

  const restoreLayerNodeGeometry = (layer: Layer | null) => {
    if (!layer) {
      return;
    }

    const node = nodeRefs.current[layer.id];
    if (!(node instanceof Konva.Node)) {
      return;
    }

    node.position({
      x: layer.x,
      y: layer.y,
    });
    node.rotation(layer.rotation);
    node.scaleX(1);
    node.scaleY(1);
    node.getLayer()?.batchDraw();
  };

  const restoreLayerInteraction = (layer: Layer | null) => {
    if (!layer) {
      return;
    }

    const origin = interactionOriginRef.current[layer.id];
    const restoredLayer = origin ? ({ ...layer, ...origin } as Layer) : layer;

    onRestoreLayerGeometry(layer.id, {
      x: restoredLayer.x,
      y: restoredLayer.y,
      width: restoredLayer.width,
      height: restoredLayer.height,
      rotation: restoredLayer.rotation,
    });
    restoreLayerNodeGeometry(restoredLayer);
    syncSelectionMetrics(restoredLayer);
  };

  const stopSelectedLayerManipulation = () => {
    transformerRef.current?.stopTransform();

    if (!selectedCanvasLayer) {
      return;
    }

    const node = nodeRefs.current[selectedCanvasLayer.id];
    if (node instanceof Konva.Node && node.isDragging()) {
      node.stopDrag();
    }

    cancelledInteractionLayerIdsRef.current.add(selectedCanvasLayer.id);
    restoreLayerInteraction(selectedCanvasLayer);
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      releaseCapturedTouchPointers();
      touchPointersRef.current.clear();
      multiTouchFreezeRef.current = false;
      cancelledInteractionLayerIdsRef.current.clear();
      interactionOriginRef.current = {};
      pinchGestureRef.current = null;
      touchPinchGestureRef.current = null;
      pinchActionLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleSystemBoundary = () => {
      if (isPreparingSavePreview || isSavePreviewOpen) {
        return;
      }

      resetTransientInteractionState({
        restoreSelectedLayer: true,
      });
    };

    const handleVisibilityChange = () => {
      handleSystemBoundary();
    };

    window.addEventListener('blur', handleSystemBoundary);
    window.addEventListener('focus', handleSystemBoundary);
    window.addEventListener('pageshow', handleSystemBoundary);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleSystemBoundary);
      window.removeEventListener('focus', handleSystemBoundary);
      window.removeEventListener('pageshow', handleSystemBoundary);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPreparingSavePreview, isSavePreviewOpen, selectedCanvasLayer]);

  useEffect(() => {
    if (!isPreparingSavePreview && !isSavePreviewOpen) {
      return;
    }

    resetTransientInteractionState({
      restoreSelectedLayer: true,
    });
  }, [isPreparingSavePreview, isSavePreviewOpen, selectedCanvasLayer]);

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') {
      return;
    }

    touchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that refuse pointer capture for synthetic or secondary touches.
    }

    if (touchPointersRef.current.size >= 2) {
      multiTouchFreezeRef.current = true;
      setIsMultiTouchActive(true);
      event.preventDefault();
      cancelLongPress();
      stopSelectedLayerManipulation();

      if (
        !pinchActionLockRef.current &&
        (isCompactPreview || isFullscreenCanvas) &&
        !pinchGestureRef.current
      ) {
        const startDistance = readPinchDistance();
        if (startDistance > 0) {
          const center = readPinchCenter(event.currentTarget);
          pinchGestureRef.current = {
            mode: isFullscreenCanvas ? 'fullscreen' : 'compact',
            startDistance,
            startZoom: fullscreenZoom,
            anchorX:
              isFullscreenCanvas && center
                ? (center.x - fullscreenPan.x) / (scale * fullscreenZoom)
                : 0,
            anchorY:
              isFullscreenCanvas && center
                ? (center.y - fullscreenPan.y) / (scale * fullscreenZoom)
                : 0,
            shouldCollapse: false,
          };
        }
      }

      return;
    }

    if (isPreparingSavePreview || isSavePreviewOpen || layers.length === 0) {
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
    if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }

    const pinchGesture = pinchGestureRef.current;
    if (event.pointerType === 'touch' && pinchGesture && touchPointersRef.current.size >= 2) {
      event.preventDefault();
      cancelLongPress();
      stopSelectedLayerManipulation();

      const nextDistance = readPinchDistance();
      if (nextDistance <= 0 || pinchGesture.startDistance <= 0) {
        return;
      }

      const stretchFactor = nextDistance / pinchGesture.startDistance;

      if (pinchGesture.mode === 'compact') {
        if (stretchFactor >= 1.12 && !pinchActionLockRef.current) {
          pinchActionLockRef.current = 'expand';
          pinchGestureRef.current = null;
          onPinchExpand();
        }
        return;
      }

      const nextZoom = Math.min(2.4, Math.max(1, pinchGesture.startZoom * stretchFactor));
      pinchGesture.shouldCollapse = nextZoom <= 1.02 && stretchFactor <= 0.88;
      onPinchZoom(
        buildNextFullscreenTransform(nextZoom, readPinchCenter(event.currentTarget), pinchGesture),
      );
      return;
    }

    if (!longPressStartRef.current || longPressTriggeredRef.current) {
      return;
    }

    const deltaX = event.clientX - longPressStartRef.current.x;
    const deltaY = event.clientY - longPressStartRef.current.y;
    if (Math.hypot(deltaX, deltaY) > 10) {
      cancelLongPress();
    }
  };

  const handleStagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchPointersRef.current.delete(event.pointerId);
      if (touchPointersRef.current.size < 2 && pinchGestureRef.current) {
        const pinchGesture = pinchGestureRef.current;
        if (pinchGesture.mode === 'fullscreen' && pinchGesture.shouldCollapse) {
          pinchActionLockRef.current = 'collapse';
          onPinchCollapse();
        }
        clearPinchState();
      }

      if (touchPointersRef.current.size === 0) {
        multiTouchFreezeRef.current = false;
        setIsMultiTouchActive(false);
        pinchActionLockRef.current = null;
      }

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore browsers that do not keep pointer capture here.
      }
    }

    cancelLongPress();
  };

  const handleStageTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      return;
    }

    event.preventDefault();
    multiTouchFreezeRef.current = true;
    setIsMultiTouchActive(true);
    cancelLongPress();
    stopSelectedLayerManipulation();

    if (
      pinchActionLockRef.current ||
      (!isCompactPreview && !isFullscreenCanvas) ||
      touchPinchGestureRef.current
    ) {
      return;
    }

    const startDistance = readTouchPinchDistance(event.touches);
    if (startDistance <= 0) {
      return;
    }

    const center = readTouchPinchCenter(event.touches, event.currentTarget);
    touchPinchGestureRef.current = {
      mode: isFullscreenCanvas ? 'fullscreen' : 'compact',
      startDistance,
      startZoom: fullscreenZoom,
      anchorX:
        isFullscreenCanvas && center
          ? (center.x - fullscreenPan.x) / (scale * fullscreenZoom)
          : 0,
      anchorY:
        isFullscreenCanvas && center
          ? (center.y - fullscreenPan.y) / (scale * fullscreenZoom)
          : 0,
      shouldCollapse: false,
    };
  };

  const handleStageTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const pinchGesture = touchPinchGestureRef.current;
    if (!pinchGesture || event.touches.length < 2) {
      return;
    }

    event.preventDefault();
    cancelLongPress();
    stopSelectedLayerManipulation();

    const nextDistance = readTouchPinchDistance(event.touches);
    if (nextDistance <= 0 || pinchGesture.startDistance <= 0) {
      return;
    }

    const stretchFactor = nextDistance / pinchGesture.startDistance;
    if (pinchGesture.mode === 'compact') {
      if (stretchFactor >= 1.12 && !pinchActionLockRef.current) {
        pinchActionLockRef.current = 'expand';
        touchPinchGestureRef.current = null;
        onPinchExpand();
      }
      return;
    }

    const nextZoom = Math.min(2.4, Math.max(1, pinchGesture.startZoom * stretchFactor));
    pinchGesture.shouldCollapse = nextZoom <= 1.02 && stretchFactor <= 0.88;
    onPinchZoom(
      buildNextFullscreenTransform(
        nextZoom,
        readTouchPinchCenter(event.touches, event.currentTarget),
        pinchGesture,
      ),
    );
  };

  const handleStageTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const pinchGesture = touchPinchGestureRef.current;
    if (!pinchGesture) {
      if (event.touches.length === 0) {
        multiTouchFreezeRef.current = false;
        setIsMultiTouchActive(false);
        pinchActionLockRef.current = null;
      }
      return;
    }

    if (event.touches.length < 2) {
      if (pinchGesture.mode === 'fullscreen' && pinchGesture.shouldCollapse) {
        pinchActionLockRef.current = 'collapse';
        onPinchCollapse();
      }

      touchPinchGestureRef.current = null;
      if (event.touches.length === 0) {
        multiTouchFreezeRef.current = false;
        setIsMultiTouchActive(false);
        pinchActionLockRef.current = null;
      }
    } else if (event.touches.length === 0) {
      multiTouchFreezeRef.current = false;
      setIsMultiTouchActive(false);
    }
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
  const frameWidth = Math.round(stageViewportWidth * scale);
  const frameHeight = Math.round(stageViewportHeight * scale);

  useEffect(() => {
    if (!selectedCanvasLayer) {
      setSelectionMetrics(null);
      return;
    }

    syncSelectionMetrics(selectedCanvasLayer);
  }, [
    canvasOffsetX,
    canvasOffsetY,
    viewportPanX,
    viewportPanY,
    selectedCanvasLayer,
    selectedCanvasLayer?.height,
    selectedCanvasLayer?.id,
    selectedCanvasLayer?.rotation,
    selectedCanvasLayer?.width,
    selectedCanvasLayer?.x,
    selectedCanvasLayer?.y,
    visualScale,
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
  const frameOffsetLeft = stageFrameRef.current?.offsetLeft ?? 0;
  const frameOffsetTop = stageFrameRef.current?.offsetTop ?? 0;
  const overlayEdgeInset = 8;
  const toolbarOffset = 10;
  const popoverOffset = 10;
  const fullscreenOverlaySafeTop = isFullscreenCanvas ? 84 : 8;
  const shouldHideSelectionUiForColorPicking =
    selectedTextLayer !== null && isTextToolsOpen && isSelectionColorPicking;

  if (selectedCanvasLayer) {
    const resolvedSelectionMetrics = selectionMetrics ?? readSelectionMetrics(selectedCanvasLayer);
    if (resolvedSelectionMetrics) {
      const toolbarButtonCount = selectedTextLayer ? 4 : 2;
      const toolbarWidth = toolbarButtonCount * 30 + (toolbarButtonCount - 1) * 4;
      const toolbarHeight = 30;
      const popoverWidth = Math.min(228, frameWidth - overlayEdgeInset * 2);
      const selectionTop = resolvedSelectionMetrics.top;
      const selectionRight = resolvedSelectionMetrics.right;
      const selectionBottom = resolvedSelectionMetrics.bottom;
      const toolbarLeftLocal = clampToFrame(
        selectionRight - toolbarWidth,
        overlayEdgeInset,
        Math.max(overlayEdgeInset, frameWidth - toolbarWidth - overlayEdgeInset),
      );
      const toolbarPreferredTop = selectionTop - toolbarHeight - toolbarOffset;
      const toolbarFallbackTop = selectionBottom + toolbarOffset;
      const toolbarTopLocal =
        toolbarPreferredTop >= fullscreenOverlaySafeTop
          ? toolbarPreferredTop
          : clampToFrame(
              toolbarFallbackTop,
              fullscreenOverlaySafeTop,
              Math.max(fullscreenOverlaySafeTop, frameHeight - toolbarHeight - overlayEdgeInset),
            );
      const popoverLeftLocal = clampToFrame(
        Math.min(selectionRight - popoverWidth, toolbarLeftLocal + toolbarWidth - popoverWidth),
        overlayEdgeInset,
        Math.max(overlayEdgeInset, frameWidth - popoverWidth - overlayEdgeInset),
      );
      const popoverBelowTop = toolbarTopLocal + toolbarHeight + popoverOffset;
      const popoverAboveTop = Math.min(
        toolbarTopLocal - estimatedPopoverHeight - popoverOffset,
        selectionTop - estimatedPopoverHeight - popoverOffset,
      );
      const minPopoverTop = fullscreenOverlaySafeTop;
      const maxPopoverTop = Math.max(
        fullscreenOverlaySafeTop,
        frameHeight - estimatedPopoverHeight - overlayEdgeInset,
      );
      const canPlaceBelow = popoverBelowTop + estimatedPopoverHeight <= frameHeight - overlayEdgeInset;
      const canPlaceAbove = popoverAboveTop >= fullscreenOverlaySafeTop;
      const popoverTopLocal =
        isCompactPreview && !isFullscreenCanvas
          ? selectionTop + selectionBottom < frameHeight
            ? popoverBelowTop
            : popoverAboveTop
          : canPlaceBelow
            ? popoverBelowTop
            : canPlaceAbove
              ? popoverAboveTop
              : clampToFrame(
                  selectionTop + (selectionBottom - selectionTop) / 2 - estimatedPopoverHeight / 2,
                  minPopoverTop,
                  maxPopoverTop,
                );

      selectionToolbarStyle = {
        left: `${frameOffsetLeft + toolbarLeftLocal}px`,
        top: `${frameOffsetTop + toolbarTopLocal}px`,
      };

      selectionPopoverStyle = {
        left: `${frameOffsetLeft + popoverLeftLocal}px`,
        top: `${frameOffsetTop + popoverTopLocal}px`,
        width: `${popoverWidth}px`,
      };
    }

    if (selectedTextLayer) {
      const minimumInlineEditorWidth = Math.min(frameWidth - 16, isFullscreenCanvas ? 360 : 300);
      const minimumInlineEditorHeight = Math.min(frameHeight - 16, isFullscreenCanvas ? 280 : 220);
      const inlineEditorWidth = Math.min(
        frameWidth - 16,
        Math.max(selectedTextLayer.width * visualScale + 48, minimumInlineEditorWidth),
      );
      const inlineEditorHeight = Math.min(
        frameHeight - 16,
        Math.max(selectedTextLayer.height * visualScale + 56, minimumInlineEditorHeight),
      );
      const inlineEditorLeft = clampToFrame(
        (canvasOffsetX + selectedTextLayer.x) * visualScale + viewportPanX,
        8,
        Math.max(8, frameWidth - inlineEditorWidth - 8),
      );
      const inlineEditorTop = clampToFrame(
        (canvasOffsetY + selectedTextLayer.y) * visualScale + viewportPanY,
        8,
        Math.max(8, frameHeight - inlineEditorHeight - 8),
      );

      inlineEditorStyle = {
        left: `${frameOffsetLeft + inlineEditorLeft}px`,
        top: `${frameOffsetTop + inlineEditorTop}px`,
        width: `${inlineEditorWidth}px`,
        height: `${inlineEditorHeight}px`,
        transform: `rotate(${selectedTextLayer.rotation}deg)`,
      };
    }
  }

  const getCollageSlotById = (slotId: string | undefined) =>
    collageSlots.find((slot) => slot.id === slotId) ?? null;

  const getCollageSlotCornerRadius = (slot: CollageSlot): CornerRadiusValue => {
    if (!hasVisibleCollageFrame || collageCornerRadius <= 0) {
      return 0;
    }

    const nextRadius = Math.min(collageCornerRadius, slot.width / 2, slot.height / 2);
    if (nextRadius <= 0) {
      return 0;
    }

    if (collageDividersEnabled || !collageBounds) {
      return nextRadius;
    }

    const isLeftEdge = Math.abs(slot.x - collageBounds.left) < 0.5;
    const isTopEdge = Math.abs(slot.y - collageBounds.top) < 0.5;
    const isRightEdge = Math.abs(slot.x + slot.width - collageBounds.right) < 0.5;
    const isBottomEdge = Math.abs(slot.y + slot.height - collageBounds.bottom) < 0.5;

    return [
      isLeftEdge && isTopEdge ? nextRadius : 0,
      isRightEdge && isTopEdge ? nextRadius : 0,
      isRightEdge && isBottomEdge ? nextRadius : 0,
      isLeftEdge && isBottomEdge ? nextRadius : 0,
    ];
  };

  const renderCollageSlot = (slot: CollageSlot) => {
    const isFilled = collageFilledSlotIds.has(slot.id);
    const slotCornerRadius = getCollageSlotCornerRadius(slot);
    const slotFill =
      isFilled && isCollageSpacingless ? 'transparent' : isFilled ? 'rgba(255,248,240,0.02)' : 'rgba(255,248,240,0.13)';
    const slotStroke =
      isFilled && isCollageSpacingless ? undefined : isFilled ? 'rgba(255,248,240,0.08)' : 'rgba(255,248,240,0.42)';

    return (
      <Group key={slot.id} listening={false}>
        <Rect
          x={slot.x}
          y={slot.y}
          width={slot.width}
          height={slot.height}
          cornerRadius={slotCornerRadius}
          fill={slotFill}
          stroke={slotStroke}
          strokeWidth={1.4}
          dash={isFilled ? undefined : [16, 10]}
        />
        {!isFilled ? (
          <>
            <Text
              x={slot.x + slot.width / 2 - 90}
              y={slot.y + slot.height / 2 - 24}
              width={180}
              align="center"
              text={slot.label}
              fontSize={24}
              fontStyle="bold"
              fill="rgba(255,248,240,0.84)"
            />
            <Text
              x={slot.x + slot.width / 2 - 130}
              y={slot.y + slot.height / 2 + 8}
              width={260}
              align="center"
              text="Добавь фото"
              fontSize={16}
              fill="rgba(255,239,228,0.62)"
            />
          </>
        ) : null}
      </Group>
    );
  };

  const renderCollageSlotOutline = (slot: CollageSlot) => {
    const isSelected =
      selectedLayer?.type === 'image' && selectedLayer.kind === 'collage' && selectedLayer.slotId === slot.id;
    const isFilled = collageFilledSlotIds.has(slot.id);

    if (isCollageSpacingless && isFilled && !isSelected) {
      return null;
    }

    const inset = isCollageSpacingless && isFilled ? 1.5 : 0;
    const outlineWidth = Math.max(0, slot.width - inset * 2);
    const outlineHeight = Math.max(0, slot.height - inset * 2);
    const outlineCornerRadius = insetCornerRadius(getCollageSlotCornerRadius(slot), inset);

    return (
      <Rect
        key={`${slot.id}-outline`}
        x={slot.x + inset}
        y={slot.y + inset}
        width={outlineWidth}
        height={outlineHeight}
        cornerRadius={outlineCornerRadius}
        fillEnabled={false}
        stroke={isSelected ? '#d9683c' : 'rgba(255,248,240,0.28)'}
        strokeWidth={isSelected ? 3.2 : 1}
        listening={false}
      />
    );
  };

  const renderImageLayer = (layer: Extract<Layer, { type: 'image' }>) => {
    const crop = {
      x: (layer.crop.x / 100) * layer.naturalWidth,
      y: (layer.crop.y / 100) * layer.naturalHeight,
      width: (layer.crop.width / 100) * layer.naturalWidth,
      height: (layer.crop.height / 100) * layer.naturalHeight,
    };
    const collageSlot = layer.kind === 'collage' ? getCollageSlotById(layer.slotId) : null;

    if (layer.kind === 'background') {
      return (
        <KonvaImage
          key={layer.id}
          x={layer.x}
          y={layer.y}
          image={layer.image}
          width={layer.width}
          height={layer.height}
          crop={crop}
          listening={false}
        />
      );
    }

    const handleOverlayPress = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (layer.kind !== 'overlay' || isTwoFingerGestureActive()) {
        return;
      }

      rememberLayerInteractionOrigin(layer);
      cancelledInteractionLayerIdsRef.current.delete(layer.id);
      onSelectLayer(layer.id);
      syncSelectionMetrics(layer);

      const draggableNode =
        event.currentTarget instanceof Konva.Node ? event.currentTarget : event.target;
      if (draggableNode instanceof Konva.Node && !draggableNode.isDragging()) {
        draggableNode.startDrag();
      }
    };

    const sharedProps = {
      key: layer.id,
      x: layer.x,
      y: layer.y,
      draggable: true,
      rotation: layer.rotation,
      dragBoundFunc: (position: { x: number; y: number }) => {
        if (layer.kind === 'overlay' || dragArmedImageId === layer.id) {
          return position;
        }

        if (layer.kind === 'collage' && collageSlot) {
          return {
            x: clampToFrame(position.x, collageSlot.x + collageSlot.width - layer.width, collageSlot.x),
            y: clampToFrame(position.y, collageSlot.y + collageSlot.height - layer.height, collageSlot.y),
          };
        }

        return {
          x: layer.x,
          y: layer.y,
        };
      },
      onClick: () => {
        if (layer.kind === 'overlay' || layer.kind === 'collage') {
          onSelectLayer(layer.id);
        } else {
          onTapImageLayer(layer.id);
        }

        syncSelectionMetrics(layer);
      },
      onTap: () => {
        if (layer.kind === 'overlay' || layer.kind === 'collage') {
          onSelectLayer(layer.id);
        } else {
          onTapImageLayer(layer.id);
        }

        syncSelectionMetrics(layer);
      },
      onDblClick: () => {
        if (layer.kind !== 'overlay' && layer.kind !== 'collage') {
          onArmImageDrag(layer.id);
        }
      },
      onDblTap: () => {
        if (layer.kind !== 'overlay' && layer.kind !== 'collage') {
          onArmImageDrag(layer.id);
        }
      },
      onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => {
        if (isTwoFingerGestureActive()) {
          event.target.stopDrag();
          event.target.position({
            x: layer.x,
            y: layer.y,
          });
          return;
        }

        if (layer.kind === 'overlay') {
          rememberLayerInteractionOrigin(layer);
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          onSelectLayer(layer.id);
          syncSelectionMetrics(layer);
          return;
        }

        if (layer.kind === 'collage') {
          rememberLayerInteractionOrigin(layer);
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          onSelectLayer(layer.id);
          syncSelectionMetrics(layer);
          return;
        }

        rememberLayerInteractionOrigin(layer);
        cancelledInteractionLayerIdsRef.current.delete(layer.id);
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
      },
      onDragMove: () => {
        if (isTwoFingerGestureActive()) {
          stopSelectedLayerManipulation();
          return;
        }

        syncSelectionMetrics(layer);
      },
      onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
        if (cancelledInteractionLayerIdsRef.current.has(layer.id)) {
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          restoreLayerInteraction(layer);
          clearLayerInteractionOrigin(layer.id);
          return;
        }

        syncSelectionMetrics(layer);
        onDragEnd(layer.id, event);
        clearLayerInteractionOrigin(layer.id);
      },
      onTransformStart: () => {
        if (!isTwoFingerGestureActive()) {
          rememberLayerInteractionOrigin(layer);
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          return;
        }

        stopSelectedLayerManipulation();
      },
      onTransform: () => {
        if (isTwoFingerGestureActive()) {
          stopSelectedLayerManipulation();
          return;
        }

        syncSelectionMetrics(layer);
      },
      onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
        if (cancelledInteractionLayerIdsRef.current.has(layer.id)) {
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          restoreLayerInteraction(layer);
          clearLayerInteractionOrigin(layer.id);
          return;
        }

        syncSelectionMetrics(layer);
        onTransform(layer.id, event);
        clearLayerInteractionOrigin(layer.id);
      },
      ref: (node: Konva.Node | null) => {
        if (node) {
          nodeRefs.current[layer.id] = node;
        }
      },
    };

    if (layer.kind === 'overlay') {
      return (
        <Group
          {...sharedProps}
          width={layer.width}
          height={layer.height}
          onMouseDown={handleOverlayPress}
          onTouchStart={handleOverlayPress}
        >
          <Rect
            x={0}
            y={0}
            width={layer.width}
            height={layer.height}
            fill="rgba(0,0,0,0.001)"
          />
          <KonvaImage
            x={0}
            y={0}
            image={layer.image}
            width={layer.width}
            height={layer.height}
            crop={crop}
            listening={false}
          />
        </Group>
      );
    }

    if (layer.kind === 'collage' && collageSlot) {
      const slotCornerRadius = getCollageSlotCornerRadius(collageSlot);
      return (
        <Group
          key={`${layer.id}-slot`}
          clipFunc={(context) => {
            drawRoundedRectPath(
              context,
              collageSlot.x,
              collageSlot.y,
              collageSlot.width,
              collageSlot.height,
              slotCornerRadius,
            );
          }}
        >
          <KonvaImage
            {...sharedProps}
            image={layer.image}
            width={layer.width}
            height={layer.height}
            hitStrokeWidth={20}
            crop={crop}
          />
        </Group>
      );
    }

    if (layer.kind === 'collage') {
      return null;
    }

    return (
      <KonvaImage
        {...sharedProps}
        image={layer.image}
        width={layer.width}
        height={layer.height}
        hitStrokeWidth={20}
        crop={crop}
      />
    );
  };

  const renderTextLayer = (layer: TextLayer) => (
    <Group
      key={layer.id}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      draggable
      rotation={layer.rotation}
      opacity={editingTextLayerId === layer.id ? 0 : 1}
      onTransformStart={() => {
        if (isTwoFingerGestureActive()) {
          stopSelectedLayerManipulation();
          return;
        }

        rememberLayerInteractionOrigin(layer);
        cancelledInteractionLayerIdsRef.current.delete(layer.id);
      }}
      onTransform={(event) => {
        if (isTwoFingerGestureActive()) {
          stopSelectedLayerManipulation();
          return;
        }

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
      onDragStart={(event) => {
        if (!isTwoFingerGestureActive()) {
          rememberLayerInteractionOrigin(layer);
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          return;
        }

        event.target.stopDrag();
        event.target.position({
          x: layer.x,
          y: layer.y,
        });
      }}
      onDragMove={() => {
        if (isTwoFingerGestureActive()) {
          stopSelectedLayerManipulation();
          return;
        }

        syncSelectionMetrics(layer);
      }}
      onDragEnd={(event) => {
        if (cancelledInteractionLayerIdsRef.current.has(layer.id)) {
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          restoreLayerInteraction(layer);
          clearLayerInteractionOrigin(layer.id);
          return;
        }

        syncSelectionMetrics(layer);
        onDragEnd(layer.id, event);
        clearLayerInteractionOrigin(layer.id);
      }}
      onTransformEnd={(event) => {
        if (cancelledInteractionLayerIdsRef.current.has(layer.id)) {
          cancelledInteractionLayerIdsRef.current.delete(layer.id);
          restoreLayerInteraction(layer);
          clearLayerInteractionOrigin(layer.id);
          return;
        }

        syncSelectionMetrics(layer);
        onTransform(layer.id, event);
        clearLayerInteractionOrigin(layer.id);
      }}
      ref={(node) => {
        if (node) {
          nodeRefs.current[layer.id] = node;
        }
      }}
    >
      {buildTextHighlightRects(layer).map((rect, index) => {
        const backgroundStyle = layer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE;
        const backgroundColor = layer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR;
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
            shadowColor={backgroundStyle === 'soft' ? withAlpha(backgroundColor, 0.3) : undefined}
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
  );

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
            ref={stageFrameRef}
            className="canvas-stage-frame"
            style={{
              width: `${frameWidth}px`,
              height: `${frameHeight}px`,
              overflow: isFullscreenCanvas ? 'hidden' : 'visible',
            }}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerEnd}
            onPointerCancel={handleStagePointerEnd}
            onPointerLeave={handleStagePointerEnd}
            onTouchStart={handleStageTouchStart}
            onTouchMove={handleStageTouchMove}
            onTouchEnd={handleStageTouchEnd}
            onTouchCancel={handleStageTouchEnd}
          >
            <div
              className="canvas-stage-inner"
              style={{
                width: `${stageViewportWidth}px`,
                height: `${stageViewportHeight}px`,
                transform: `translate(${viewportPanX}px, ${viewportPanY}px) scale(${visualScale})`,
              }}
            >
              <Stage
                ref={stageRef}
                width={stageViewportWidth}
                height={stageViewportHeight}
                onMouseDown={onCanvasMouseDown}
                onTouchStart={onCanvasMouseDown}
              >
                <KonvaLayer>
                  <Rect
                    x={canvasOffsetX}
                    y={canvasOffsetY}
                    width={width}
                    height={height}
                    fill="#fff"
                    listening={false}
                  />
                  <Group
                    x={canvasOffsetX}
                    y={canvasOffsetY}
                    clip={{
                      x: 0,
                      y: 0,
                      width,
                      height,
                    }}
                  >
                    {layers.map((layer) =>
                      layer.type === 'image' && layer.kind === 'background'
                        ? renderImageLayer(layer)
                        : null,
                    )}
                    {compositionMode === 'collage' ? collageSlots.map((slot) => renderCollageSlot(slot)) : null}
                    {layers.map((layer) =>
                      layer.type === 'image' && layer.kind === 'collage'
                        ? renderImageLayer(layer)
                        : null,
                    )}
                    {compositionMode === 'collage'
                      ? collageSlots.map((slot) => renderCollageSlotOutline(slot))
                      : null}
                  </Group>
                  <Group x={canvasOffsetX} y={canvasOffsetY}>
                    {layers.map((layer) => {
                      if (layer.type === 'image') {
                        return layer.kind === 'overlay' ? renderImageLayer(layer) : null;
                      }

                      return renderTextLayer(layer);
                    })}
                  </Group>
                  {!isMultiTouchActive && !isSelectedCollageLayer ? (
                    <Transformer
                      ref={transformerRef}
                      rotateEnabled={!(selectedLayer?.type === 'image' && selectedLayer.kind === 'collage')}
                      ignoreStroke
                      shouldOverdrawWholeArea={selectedLayer?.type === 'image'}
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
                  ) : null}
                </KonvaLayer>
              </Stage>
            </div>
          </div>

          {selectedCanvasLayer && selectionToolbarStyle && !isEditingSelectedText && !isMultiTouchActive && !isSelectedCollageLayer ? (
            <>
              <div
                className={`text-selection-toolbar${
                  shouldHideSelectionUiForColorPicking ? ' text-selection-toolbar--hidden' : ''
                }`}
                style={selectionToolbarStyle}
              >
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

              {selectedTextLayer && isTextToolsOpen && selectionPopoverStyle && !isMultiTouchActive ? (
                <div
                  className={`text-selection-popover${
                    shouldHideSelectionUiForColorPicking ? ' text-selection-popover--hidden' : ''
                  }`}
                  style={selectionPopoverStyle}
                >
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
                        onClick={handleStartSelectionColorPicking}
                        onFocus={handleStartSelectionColorPicking}
                        onChange={(event) =>
                          {
                            onQuickTextStyleChange({
                              backgroundColor: event.target.value,
                            });
                            handleFinishSelectionColorPicking();
                          }
                        }
                        onBlur={handleFinishSelectionColorPicking}
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
                      onClick={handleStartSelectionColorPicking}
                      onFocus={handleStartSelectionColorPicking}
                      onChange={(event) =>
                        {
                          onQuickTextStyleChange({
                            color: event.target.value,
                          });
                          handleFinishSelectionColorPicking();
                        }
                      }
                      onBlur={handleFinishSelectionColorPicking}
                    />
                  </label>
                </div>
              ) : null}

            </>
          ) : null}

          {selectedTextLayer && isEditingSelectedText && inlineEditorStyle && !isMultiTouchActive ? (
            <div className="text-inline-editor" style={inlineEditorStyle}>
              <div className="text-inline-editor-head">
                <span className="text-inline-editor-badge">Редактирование</span>
                <span className="text-inline-editor-tip">Текст уже выделен</span>
              </div>
              <textarea
                ref={textEditorRef}
                className="text-inline-editor-input"
                value={selectedTextLayer.text}
                style={{
                  fontFamily: selectedTextLayer.fontFamily,
                  fontSize: `${Math.min(Math.max(selectedTextLayer.fontSize, 18), 40)}px`,
                  lineHeight: String(selectedTextLayer.lineHeight),
                  color: '#17120f',
                  textAlign: selectedTextLayer.align,
                  letterSpacing: `${Math.min(Math.max(selectedTextLayer.letterSpacing ?? 0, -1), 12)}px`,
                  fontStyle: selectedTextLayer.fontStyle?.includes('italic') ? 'italic' : 'normal',
                  fontWeight: selectedTextLayer.fontStyle?.includes('bold') ? 700 : 500,
                  caretColor: '#17120f',
                  backgroundColor: '#ffffff',
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
            {layers.length === 0 && compositionMode !== 'collage'
              ? `Пустая канва ${width} x ${height}. Перетащите фото сюда, вставьте из буфера или нажмите “Добавить фон”.`
              : compositionMode === 'collage' && collageSlots.length > 0
                ? `${width} x ${height} · ${Math.round(scale * 100)}% · коллаж ${filledCollageSlotIds.length}/${collageSlots.length}. Выделяй кадр и тяни фото внутри ячейки, запас под движение уже добавлен.`
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
