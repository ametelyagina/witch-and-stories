import { Layer } from '../editor/types';
import { Stage, Layer as KonvaLayer, Text, Transformer, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { DragEvent, MutableRefObject, RefObject } from 'react';

type EditorCanvasProps = {
  stageRef: RefObject<Konva.Stage | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  layers: Layer[];
  width: number;
  height: number;
  scale: number;
  selectedLayer: Layer | null;
  dragArmedImageId: string | null;
  onCanvasMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onSelectLayer: (id: string) => void;
  onTapImageLayer: (id: string) => void;
  onArmImageDrag: (id: string) => void;
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
  dragArmedImageId,
  onCanvasMouseDown,
  onSelectLayer,
  onTapImageLayer,
  onArmImageDrag,
  onDragEnd,
  onTransform,
  transformerRef,
  nodeRefs,
  stageRef,
  containerRef,
  onDropFiles,
}: EditorCanvasProps) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onDropFiles(files);
    }
  };

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
                        align={layer.align}
                        letterSpacing={layer.letterSpacing ?? 0}
                        lineHeight={layer.lineHeight}
                        wrap="word"
                        onTransform={(event) => onTransform(layer.id, event)}
                        onClick={() => onSelectLayer(layer.id)}
                        onTap={() => onSelectLayer(layer.id)}
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
        </div>

        <p className="hint">
          {layers.length === 0
            ? `Пустая канва ${width} x ${height}. Перетащите фото сюда, вставьте из буфера или нажмите “Загрузить фото”.`
            : selectedLayer?.type === 'image' && dragArmedImageId === selectedLayer.id
              ? `${width} x ${height} · ${Math.round(scale * 100)}% · фото разблокировано для перемещения, после drag блокировка вернётся.`
              : selectedLayer?.type === 'image'
                ? `${width} x ${height} · ${Math.round(scale * 100)}% · первый тап выделяет фото, второй тап или double tap включает перемещение.`
                : `${width} x ${height} · ${Math.round(scale * 100)}% · кликните по пустой области, чтобы снять выделение.`}
        </p>
      </div>
    </section>
  );
}
