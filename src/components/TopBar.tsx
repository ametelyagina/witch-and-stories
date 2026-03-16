import { Preset, PresetDefinition } from '../editor/types';

type TopBarProps = {
  preset: Preset;
  presets: PresetDefinition[];
  onPresetChange: (preset: Preset) => void;
  onUploadImage: () => void;
  onAddText: () => void;
  onUploadFont: () => void;
  onPaste: () => void;
  onDeleteSelected: () => void;
  onExport: () => void;
  isExportDisabled: boolean;
  isDeleteDisabled: boolean;
};

export function TopBar({
  preset,
  presets,
  onPresetChange,
  onUploadImage,
  onAddText,
  onUploadFont,
  onPaste,
  onDeleteSelected,
  onExport,
  isExportDisabled,
  isDeleteDisabled,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">Stories Editor</div>
      <div className="segment">
        {presets.map((item) => (
          <button
            key={item.key}
            type="button"
            className={preset === item.key ? 'active' : ''}
            onClick={() => onPresetChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" onClick={onUploadImage}>
          Загрузить фото
        </button>
        <button type="button" onClick={onAddText}>
          Добавить текст
        </button>
        <button type="button" onClick={onUploadFont}>
          Загрузить шрифт (.ttf)
        </button>
        <button type="button" onClick={onPaste}>
          Вставить
        </button>
        <button type="button" onClick={onDeleteSelected} disabled={isDeleteDisabled}>
          Удалить
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={isExportDisabled}
          className="export"
        >
          Экспорт PNG
        </button>
      </div>
    </header>
  );
}
