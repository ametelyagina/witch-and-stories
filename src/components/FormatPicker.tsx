import { useEffect } from 'react';

import { COLLAGE_LAYOUTS } from '../editor/collage';
import { CollageLayout, CompositionMode, Preset } from '../editor/types';

type FormatPickerProps = {
  open: boolean;
  preset: Preset;
  compositionMode: CompositionMode;
  collageLayout: CollageLayout;
  onPresetChange: (preset: Preset) => void;
  onCompositionModeChange: (mode: CompositionMode) => void;
  onCollageLayoutChange: (layout: CollageLayout) => void;
  onClose: () => void;
  onApply: () => void;
};

export function FormatPicker({
  open,
  preset,
  compositionMode,
  collageLayout,
  onPresetChange,
  onCompositionModeChange,
  onCollageLayoutChange,
  onClose,
  onApply,
}: FormatPickerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="format-picker" role="dialog" aria-modal="true" aria-label="Выбор формата">
        <div className="format-picker-head">
          <div>
            <h2>Выбрать формат</h2>
            <p>Один спокойный экран для размера кадра, режима и раскладки коллажа.</p>
          </div>

          <button type="button" className="ghost format-picker-close" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="format-picker-layout">
          <section className="format-picker-section">
            <div className="format-picker-section-head">
              <h3>Размер кадра</h3>
              <p>Можно сразу выбрать сторис или 4:5 для карусели.</p>
            </div>

            <div className="format-picker-segment">
              <button
                type="button"
                className={preset === 'story' ? 'active' : 'ghost'}
                onClick={() => onPresetChange('story')}
              >
                9:16
              </button>
              <button
                type="button"
                className={preset === 'carousel' ? 'active' : 'ghost'}
                onClick={() => onPresetChange('carousel')}
              >
                4:5
              </button>
            </div>
          </section>

          <section className="format-picker-section">
            <div className="format-picker-section-head">
              <h3>Режим</h3>
              <p>Одна фотография или коллаж из нескольких кадров.</p>
            </div>

            <div className="format-picker-segment">
              <button
                type="button"
                className={compositionMode === 'single' ? 'active' : 'ghost'}
                onClick={() => onCompositionModeChange('single')}
              >
                Одна
              </button>
              <button
                type="button"
                className={compositionMode === 'collage' ? 'active' : 'ghost'}
                onClick={() => onCompositionModeChange('collage')}
              >
                Коллаж
              </button>
            </div>
          </section>

          {compositionMode === 'collage' ? (
            <section className="format-picker-section">
              <div className="format-picker-section-head">
                <h3>Раскладка</h3>
                <p>Листай вниз и выбирай тот ритм кадров, который нужен сейчас.</p>
              </div>

              <div className="format-picker-layout-list" aria-label="Варианты коллажа">
                {COLLAGE_LAYOUTS.map((layout) => (
                  <button
                    key={layout.key}
                    type="button"
                    className={
                      collageLayout === layout.key
                        ? 'active format-picker-layout-button'
                        : 'ghost format-picker-layout-button'
                    }
                    onClick={() => onCollageLayoutChange(layout.key)}
                  >
                    <strong>{layout.label}</strong>
                    <small>{layout.description}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="modal-buttons">
          <button type="button" className="ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="primary" onClick={onApply}>
            ОК
          </button>
        </div>
      </section>
    </div>
  );
}
