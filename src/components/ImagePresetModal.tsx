import { PresetDefinition } from '../editor/types';

type ImagePresetModalProps = {
  open: boolean;
  presets: PresetDefinition[];
  onPick: (presetKey: PresetDefinition['key'] | null) => void;
  onClose: () => void;
};

export function ImagePresetModal({
  open,
  presets,
  onPick,
  onClose,
}: ImagePresetModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" onClick={(event) => event.stopPropagation()}>
        <h2>Как обрезать фото?</h2>
        <p>Выбери формат для главной фотографии.</p>
        <div className="modal-buttons">
          {presets.map((preset) => (
            <button type="button" key={preset.key} onClick={() => onPick(preset.key)}>
              Обрезать под {preset.label}
            </button>
          ))}
          <button type="button" onClick={() => onPick(null)}>
            Оставить как есть
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
