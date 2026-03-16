type TopBarProps = {
  selectedLayerType: 'image' | 'text' | null;
};

export function TopBar({ selectedLayerType }: TopBarProps) {
  const selectedLabel =
    selectedLayerType === 'image'
      ? 'Фото'
      : selectedLayerType === 'text'
        ? 'Текст'
        : 'Ничего';

  return (
    <header className="topbar">
      <div className="topbar-intro">
        <div className="topbar-copy-block">
          <span className="eyebrow">Header</span>
          <p className="topbar-copy">
            Быстрый редактор сторис: загружайте фото, ставьте текст, подключайте свои
            `.ttf` и сразу экспортируйте готовый PNG.
          </p>
        </div>
        <div className="topbar-brand-block">
          <div className="brand">Witch And Stories</div>
          <span className="selection-pill">Выбрано: {selectedLabel}</span>
        </div>
      </div>
    </header>
  );
}
