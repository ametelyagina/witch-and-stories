# E2E Regression Tests

Базовый набор `mobile regression tests` лежит в:

- `tests/e2e/mobile-regressions.test.mjs`

Запуск:

```bash
npm run test:e2e
```

Сейчас набор проверяет:

- полноэкранное раскрытие `canvas` на телефоне
- `inline text editing` в fullscreen-режиме
- `text highlight / background` за текстом
- позиционирование `Aa`-popover вне области текста
- кнопку `Вставить` для `clipboard sticker overlay`
- сохранение фонового фото после возврата в приложение и вставки стикера
- мгновенный `drag` для `sticker overlay` без отдельной разблокировки
