import { useEffect, useMemo, useRef, useState } from 'react';

import { FontOption } from '../editor/textPresets';
import { UploadedFont } from '../editor/types';

type FontPickerProps = {
  value: string;
  fontOptions: FontOption[];
  uploadedFonts: UploadedFont[];
  onSelectFont: (family: string) => void;
  onDeleteUploadedFont: (fontId: string) => void;
  ariaLabel: string;
  compact?: boolean;
};

export function FontPicker({
  value,
  fontOptions,
  uploadedFonts,
  onSelectFont,
  onDeleteUploadedFont,
  ariaLabel,
  compact = false,
}: FontPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const uploadedFontByFamily = useMemo(() => {
    return new Map(
      uploadedFonts
        .filter((font) => font.id !== 'default')
        .map((font) => [font.family, font] as const),
    );
  }, [uploadedFonts]);

  const selectedOption =
    fontOptions.find((font) => font.family === value) ??
    fontOptions[0] ?? {
      id: 'fallback-font',
      name: 'System Sans',
      family: 'Arial',
      source: 'builtin' as const,
    };
  const selectedUploadedFont = uploadedFontByFamily.get(selectedOption.family) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className={`font-picker${compact ? ' font-picker--compact' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`ghost font-picker-trigger${isOpen ? ' font-picker-trigger--active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="font-picker-trigger-name" style={{ fontFamily: selectedOption.family }}>
          {selectedOption.name}
        </span>
        <span className="font-picker-trigger-meta">
          {selectedUploadedFont ? 'С устройства' : 'Встроенный'}
        </span>
      </button>

      {isOpen ? (
        <div className="font-picker-menu" role="dialog" aria-label={ariaLabel}>
          {fontOptions.map((font) => {
            const uploadedFont = uploadedFontByFamily.get(font.family) ?? null;
            const isSelected = value === font.family;

            return (
              <div
                key={font.id}
                className={`font-picker-option${isSelected ? ' font-picker-option--active' : ''}`}
              >
                <button
                  type="button"
                  className="font-picker-option-button"
                  onClick={() => {
                    onSelectFont(font.family);
                    setIsOpen(false);
                  }}
                >
                  <span className="font-picker-option-name" style={{ fontFamily: font.family }}>
                    {font.name}
                  </span>
                  <span className="font-picker-option-meta">
                    {uploadedFont ? 'Сохранён на этом устройстве' : 'Встроенный набор'}
                  </span>
                </button>

                {uploadedFont ? (
                  <button
                    type="button"
                    className="ghost font-picker-delete"
                    aria-label={`Удалить шрифт ${uploadedFont.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsOpen(false);
                      onDeleteUploadedFont(uploadedFont.id);
                    }}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
