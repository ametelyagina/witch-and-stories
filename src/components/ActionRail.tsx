type ActionRailProps = {
  onUploadImage: () => void;
  onPaste: () => void;
  onAddText: () => void;
  onUploadFont: () => void;
  onRecenterBackground: () => void;
  onRemoveBackground: () => void;
  onDeleteSelected: () => void;
  onExport: () => void;
  hasBackgroundLayer: boolean;
  isRecenterBackgroundDisabled: boolean;
  isRemoveBackgroundDisabled: boolean;
  isDeleteDisabled: boolean;
  isExportDisabled: boolean;
};

type ActionButtonProps = {
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
};

function ActionButton({ className = '', disabled, label, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`action-rail-button ${className}`.trim()}
      disabled={disabled}
      onClick={() => onClick()}
    >
      <span>{label}</span>
    </button>
  );
}

export function ActionRail({
  onUploadImage,
  onPaste,
  onAddText,
  onUploadFont,
  onRecenterBackground,
  onRemoveBackground,
  onDeleteSelected,
  onExport,
  hasBackgroundLayer,
  isRecenterBackgroundDisabled,
  isRemoveBackgroundDisabled,
  isDeleteDisabled,
  isExportDisabled,
}: ActionRailProps) {
  return (
    <aside className="action-rail">
      <ActionButton
        className="primary"
        label={hasBackgroundLayer ? 'Сменить фон' : 'Добавить фон'}
        onClick={onUploadImage}
      />
      <ActionButton
        className="ghost"
        disabled={isRemoveBackgroundDisabled}
        label="Убрать фон"
        onClick={onRemoveBackground}
      />
      <ActionButton className="ghost" label="Вставить" onClick={onPaste} />
      <ActionButton className="secondary" label="Добавить текст" onClick={onAddText} />
      <ActionButton className="ghost" label="Импорт шрифта" onClick={onUploadFont} />
      <ActionButton
        className="ghost"
        disabled={isRecenterBackgroundDisabled}
        label="Фон в центр"
        onClick={onRecenterBackground}
      />
      <ActionButton className="danger" disabled={isDeleteDisabled} label="Удалить слой" onClick={onDeleteSelected} />
      <ActionButton className="export" disabled={isExportDisabled} label="Экспорт PNG" onClick={onExport} />
    </aside>
  );
}
