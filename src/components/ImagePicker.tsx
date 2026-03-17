import { CSSProperties, useEffect, useMemo, useState } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';

import { ImageCrop, Preset, PresetDefinition } from '../editor/types';

type PickerImage = {
  src: string;
  width: number;
  height: number;
};

type ImagePickerPanelId = 'format' | 'placement' | 'zoom';

type ImagePickerProps = {
  open: boolean;
  image: PickerImage;
  presets: PresetDefinition[];
  initialPreset: Preset;
  onApply: (payload: {
    preset: Preset;
    mode: 'cover' | 'fit';
    crop: ImageCrop;
    zoom: number;
  }) => void;
  onCancel: () => void;
};

const FULL_IMAGE_CROP: ImageCrop = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const COVER_MIN_ZOOM = 1;
const COVER_MAX_ZOOM = 4;
const FIT_MIN_ZOOM = 0.25;
const FIT_MAX_ZOOM = 1;

function normalizeCropArea(area: Area | null): ImageCrop {
  if (!area) {
    return FULL_IMAGE_CROP;
  }

  const width = Math.min(100, Math.max(1, area.width));
  const height = Math.min(100, Math.max(1, area.height));
  const x = Math.min(100 - width, Math.max(0, area.x));
  const y = Math.min(100 - height, Math.max(0, area.y));

  return { x, y, width, height };
}

export function ImagePicker({
  open,
  image,
  presets,
  initialPreset,
  onApply,
  onCancel,
}: ImagePickerProps) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const [selectedPreset, setSelectedPreset] = useState<Preset>(initialPreset);
  const [mode, setMode] = useState<'cover' | 'fit'>('cover');
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<ImageCrop>(FULL_IMAGE_CROP);
  const [activePanel, setActivePanel] = useState<ImagePickerPanelId>('format');

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPreset(initialPreset);
    setMode('cover');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(FULL_IMAGE_CROP);
    setActivePanel('format');
  }, [image.src, initialPreset, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onCancel, open]);

  const presetDefinition = useMemo(
    () => presets.find((item) => item.key === selectedPreset) ?? presets[0],
    [presets, selectedPreset],
  );

  const aspect = presetDefinition.width / presetDefinition.height;
  const isCompactLayout = viewport.width < 920;
  const stageStyle = useMemo<CSSProperties>(
    () => ({
      aspectRatio: `${presetDefinition.width} / ${presetDefinition.height}`,
      width: `${Math.round(
        Math.max(
          240,
          Math.min(
            isCompactLayout ? viewport.width - 48 : viewport.width - 520,
            (viewport.height - (isCompactLayout ? 250 : 250)) * aspect,
            isCompactLayout ? 420 : 520,
          ),
        ),
      )}px`,
      maxWidth: '100%',
    }),
    [aspect, isCompactLayout, presetDefinition.height, presetDefinition.width, viewport.height, viewport.width],
  );

  const handleApply = () => {
    onApply({
      preset: selectedPreset,
      mode,
      crop: mode === 'cover' ? croppedArea : FULL_IMAGE_CROP,
      zoom:
        mode === 'cover'
          ? Math.min(COVER_MAX_ZOOM, Math.max(COVER_MIN_ZOOM, zoom))
          : Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, zoom)),
    });
  };

  const handleCropPreview = (nextArea: Area) => {
    setCroppedArea(normalizeCropArea(nextArea));
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-label="Image picker"
        aria-modal="true"
        className="image-picker"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="image-picker-head">
          <div>
            <h2>Подгонка фото</h2>
            <p>
              Перетащите фото внутри кадра и выберите нужный формат перед загрузкой на
              холст.
            </p>
          </div>
          <button type="button" className="secondary image-picker-close" onClick={onCancel}>
            Закрыть
          </button>
        </div>

        <div className="image-picker-layout">
          <div className="image-picker-preview-pane">
            <div className="image-picker-meta">
              <span>
                Формат: {presetDefinition.label} ({presetDefinition.width} x {presetDefinition.height})
              </span>
              <span>
                Фото: {image.width} x {image.height}
              </span>
            </div>

            <div className="image-picker-stage-shell">
              <div
                className={`image-picker-stage${mode === 'fit' ? ' image-picker-stage--fit' : ''}`}
                style={stageStyle}
              >
                {mode === 'cover' ? (
                  <Cropper
                    image={image.src}
                    crop={crop}
                    zoom={zoom}
                    rotation={0}
                    aspect={aspect}
                    minZoom={COVER_MIN_ZOOM}
                    maxZoom={COVER_MAX_ZOOM}
                    objectFit="cover"
                    showGrid={false}
                    restrictPosition
                    disableAutomaticStylesInjection
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropPreview}
                    onCropAreaChange={handleCropPreview}
                  />
                ) : (
                  <img
                    src={image.src}
                    alt=""
                    className="image-picker-fit-preview"
                    style={{
                      transform: `scale(${Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, zoom))})`,
                    }}
                  />
                )}
              </div>
            </div>

            <p className="image-picker-tip">
              {mode === 'cover'
                ? 'Тяните фото внутри кадра и крутите колесо или ползунок для точной подгонки.'
                : 'В режиме "Целиком" вся картинка сохраняется без обрезки, а ползунок уменьшает её внутри листа.'}
            </p>
          </div>

          <aside className="image-picker-sidebar">
            {isCompactLayout ? (
              <div className="image-picker-mobile-tabs" role="tablist" aria-label="Секции настройки фото">
                <button
                  type="button"
                  role="tab"
                  className={activePanel === 'format' ? 'active' : 'ghost'}
                  aria-selected={activePanel === 'format'}
                  onClick={() => setActivePanel('format')}
                >
                  Формат
                </button>
                <button
                  type="button"
                  role="tab"
                  className={activePanel === 'placement' ? 'active' : 'ghost'}
                  aria-selected={activePanel === 'placement'}
                  onClick={() => setActivePanel('placement')}
                >
                  Посадка
                </button>
                <button
                  type="button"
                  role="tab"
                  className={activePanel === 'zoom' ? 'active' : 'ghost'}
                  aria-selected={activePanel === 'zoom'}
                  onClick={() => setActivePanel('zoom')}
                >
                  Масштаб
                </button>
              </div>
            ) : null}

            <section className="image-picker-panel" hidden={isCompactLayout && activePanel !== 'format'}>
              <div className="image-picker-panel-head">
                <span className="eyebrow">Format</span>
                <h3>Куда готовим</h3>
              </div>
              <div className="ratio-switch">
                {presets.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={item.key === selectedPreset ? 'active' : 'ghost'}
                    onClick={() => setSelectedPreset(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="image-picker-panel" hidden={isCompactLayout && activePanel !== 'placement'}>
              <div className="image-picker-panel-head">
                <span className="eyebrow">Placement</span>
                <h3>Как посадить</h3>
              </div>
              <div className="mode-switch">
                <button
                  type="button"
                  className={mode === 'cover' ? 'active' : 'ghost'}
                  onClick={() => {
                    setMode('cover');
                    setZoom((current) => Math.min(COVER_MAX_ZOOM, Math.max(COVER_MIN_ZOOM, current)));
                  }}
                >
                  Заполнить лист
                </button>
                <button
                  type="button"
                  className={mode === 'fit' ? 'active' : 'ghost'}
                  onClick={() => {
                    setMode('fit');
                    setZoom((current) => Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, current)));
                  }}
                >
                  Целиком
                </button>
              </div>
            </section>

            <section className="image-picker-panel" hidden={isCompactLayout && activePanel !== 'zoom'}>
              <div className="image-picker-panel-head image-picker-panel-head--inline">
                <div>
                  <span className="eyebrow">Zoom</span>
                  <h3>Масштаб</h3>
                </div>
                <span className="image-picker-value">{zoom.toFixed(2)}x</span>
              </div>
              <label className="image-picker-zoom">
                <input
                  type="range"
                  min={mode === 'cover' ? String(COVER_MIN_ZOOM) : String(FIT_MIN_ZOOM)}
                  max={mode === 'cover' ? String(COVER_MAX_ZOOM) : String(FIT_MAX_ZOOM)}
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
            </section>
          </aside>
        </div>

        <div className="modal-buttons image-picker-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" onClick={handleApply}>
            Использовать фото
          </button>
        </div>
      </section>
    </div>
  );
}
