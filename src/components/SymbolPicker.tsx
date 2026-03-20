import { useEffect } from 'react';

import { SYMBOL_GROUPS } from '../editor/symbols';

type SymbolPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (symbol: string) => void;
};

export function SymbolPicker({ open, onClose, onPick }: SymbolPickerProps) {
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
      <section className="symbol-picker" role="dialog" aria-modal="true" aria-label="Символы">
        <div className="symbol-picker-head">
          <div>
            <h2>Символы</h2>
            <p>
              Добавляй стрелки и акценты как отдельные слои. Их потом можно крутить,
              увеличивать и перекрашивать как стикеры.
            </p>
          </div>

          <button type="button" className="ghost symbol-picker-close" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="symbol-picker-layout">
          {SYMBOL_GROUPS.map((group) => (
            <section key={group.id} className="symbol-picker-group" aria-label={group.title}>
              <div className="symbol-picker-group-head">
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
              </div>

              <div className="symbol-picker-grid">
                {group.items.map((item) => (
                  <button
                    key={`${group.id}-${item.value}`}
                    type="button"
                    className="ghost symbol-picker-button"
                    aria-label={`${item.label}: ${item.value}`}
                    onClick={() => onPick(item.value)}
                  >
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
