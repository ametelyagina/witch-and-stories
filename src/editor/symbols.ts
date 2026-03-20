export type SymbolOption = {
  value: string;
  label: string;
  rotation?: number;
};

export type SymbolGroup = {
  id: string;
  title: string;
  description: string;
  items: SymbolOption[];
};

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'arrows',
    title: 'Стрелки',
    description: 'Быстрые указатели для акцентов, направлений и подписи деталей.',
    items: [
      { value: '→', label: 'Вправо' },
      { value: '←', label: 'Влево' },
      { value: '↑', label: 'Вверх' },
      { value: '↓', label: 'Вниз' },
      { value: '➞', label: 'Короткая вправо' },
      { value: '➞', label: 'Короткая влево', rotation: 180 },
      { value: '➞', label: 'Короткая вверх', rotation: -90 },
      { value: '➞', label: 'Короткая вниз', rotation: 90 },
      { value: '↗', label: 'Вверх-вправо' },
      { value: '↖', label: 'Вверх-влево' },
      { value: '↘', label: 'Вниз-вправо' },
      { value: '↙', label: 'Вниз-влево' },
      { value: '↔', label: 'Горизонталь' },
      { value: '↕', label: 'Вертикаль' },
      { value: '➜', label: 'Длинная' },
      { value: '➤', label: 'Указатель' },
      { value: '➝', label: 'Мягкая' },
      { value: '⤴', label: 'Поворот вверх' },
      { value: '⤵', label: 'Поворот вниз' },
      { value: '↺', label: 'По кругу' },
    ],
  },
  {
    id: 'accents',
    title: 'Акценты',
    description: 'Небольшие декоративные знаки, если захочется усилить композицию.',
    items: [
      { value: '★', label: 'Звезда' },
      { value: '✦', label: 'Искра' },
      { value: '✳', label: 'Вспышка' },
      { value: '•', label: 'Точка' },
      { value: '✓', label: 'Галочка' },
      { value: '✕', label: 'Крестик' },
      { value: '♥', label: 'Сердце' },
      { value: '〰', label: 'Волна' },
    ],
  },
];
