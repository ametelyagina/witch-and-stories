type ActionRailProps = {
  onPrimaryImageAction: () => void;
  primaryImageLabel: string;
  onSecondaryImageAction: () => void;
  secondaryImageLabel: string;
  isSecondaryImageActionDisabled: boolean;
  onPaste: () => void;
  onAddText: () => void;
  onAddSymbol: () => void;
  onUploadFont: () => void;
  onUtilityImageAction: () => void;
  utilityImageLabel: string;
  isUtilityImageActionDisabled: boolean;
  onDeleteSelected: () => void;
  onExport: () => void;
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
  onPrimaryImageAction,
  primaryImageLabel,
  onSecondaryImageAction,
  secondaryImageLabel,
  isSecondaryImageActionDisabled,
  onPaste,
  onAddText,
  onAddSymbol,
  onUploadFont,
  onUtilityImageAction,
  utilityImageLabel,
  isUtilityImageActionDisabled,
  onDeleteSelected,
  onExport,
  isDeleteDisabled,
  isExportDisabled,
}: ActionRailProps) {
  return (
    <aside className="action-rail">
      <ActionButton className="primary" label={primaryImageLabel} onClick={onPrimaryImageAction} />
      <ActionButton
        className="ghost"
        disabled={isSecondaryImageActionDisabled}
        label={secondaryImageLabel}
        onClick={onSecondaryImageAction}
      />
      <ActionButton className="ghost" label="Вставить" onClick={onPaste} />
      <ActionButton className="secondary" label="Добавить текст" onClick={onAddText} />
      <ActionButton className="ghost" label="Символы" onClick={onAddSymbol} />
      <ActionButton className="ghost" label="Импорт шрифта" onClick={onUploadFont} />
      <ActionButton
        className="ghost"
        disabled={isUtilityImageActionDisabled}
        label={utilityImageLabel}
        onClick={onUtilityImageAction}
      />
      <ActionButton className="danger" disabled={isDeleteDisabled} label="Удалить слой" onClick={onDeleteSelected} />
      <ActionButton className="export" disabled={isExportDisabled} label="Экспорт PNG" onClick={onExport} />
    </aside>
  );
}
