import {
  DEFAULT_FONT,
  TextAlign,
  TextBackgroundStyle,
  TextFontStyle,
  TextLayer,
  UploadedFont,
} from './types';
import {
  clampTextBackgroundOpacity,
  DEFAULT_TEXT_BACKGROUND_COLOR,
  DEFAULT_TEXT_BACKGROUND_OPACITY,
  DEFAULT_TEXT_BACKGROUND_STYLE,
} from './textHighlight';

export type FontOption = {
  id: string;
  name: string;
  family: string;
  source: 'builtin' | 'uploaded';
};

export type TextStylePreset = {
  id: string;
  label: string;
  description: string;
  sample: string;
  source?: 'builtin' | 'custom';
  family: string;
  fontStyle: TextFontStyle;
  letterSpacing: number;
  fontSize: number;
  lineHeight: number;
  align: TextAlign;
  color: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundStyle: TextBackgroundStyle;
  backgroundOpacity: number;
};

export const BUILT_IN_FONT_OPTIONS: FontOption[] = [
  {
    id: 'builtin-system',
    name: 'System Sans',
    family: DEFAULT_FONT.family,
    source: 'builtin',
  },
  {
    id: 'builtin-serif-editorial',
    name: 'Editorial Serif',
    family: 'Georgia, "Times New Roman", serif',
    source: 'builtin',
  },
  {
    id: 'builtin-classic-roman',
    name: 'Classic Roman',
    family: '"Times New Roman", Georgia, serif',
    source: 'builtin',
  },
  {
    id: 'builtin-humanist',
    name: 'Humanist Sans',
    family: '"Trebuchet MS", "Verdana", sans-serif',
    source: 'builtin',
  },
  {
    id: 'builtin-poster',
    name: 'Poster Bold',
    family: 'Impact, "Arial Black", sans-serif',
    source: 'builtin',
  },
  {
    id: 'builtin-mono',
    name: 'Mono Note',
    family: '"Courier New", monospace',
    source: 'builtin',
  },
];

export const DEFAULT_TEXT_STYLE_PRESET_ID = 'story-clean';

export const BUILT_IN_TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: 'story-clean',
    label: 'Clean',
    description: 'Чистый базовый sans для быстрых сторис.',
    sample: 'Быстро\nи чисто',
    source: 'builtin',
    family: DEFAULT_FONT.family,
    fontStyle: 'bold',
    letterSpacing: 0,
    fontSize: 84,
    lineHeight: 1.08,
    align: 'left',
    color: '#241d17',
    backgroundEnabled: false,
    backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
    backgroundStyle: DEFAULT_TEXT_BACKGROUND_STYLE,
    backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
  },
  {
    id: 'editorial-serif',
    label: 'Editorial',
    description: 'Сдержанный serif для цитат и заголовков.',
    sample: 'Тихий\nакцент',
    source: 'builtin',
    family: 'Georgia, "Times New Roman", serif',
    fontStyle: 'italic',
    letterSpacing: 0,
    fontSize: 92,
    lineHeight: 1.12,
    align: 'left',
    color: '#2e2118',
    backgroundEnabled: false,
    backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
    backgroundStyle: DEFAULT_TEXT_BACKGROUND_STYLE,
    backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
  },
  {
    id: 'poster-bold',
    label: 'Poster',
    description: 'Плотный display-стиль для крупных фраз.',
    sample: 'Смело',
    source: 'builtin',
    family: 'Impact, "Arial Black", sans-serif',
    fontStyle: 'normal',
    letterSpacing: 1.4,
    fontSize: 120,
    lineHeight: 0.92,
    align: 'left',
    color: '#241d17',
    backgroundEnabled: false,
    backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
    backgroundStyle: DEFAULT_TEXT_BACKGROUND_STYLE,
    backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
  },
  {
    id: 'soft-humanist',
    label: 'Soft',
    description: 'Мягкий humanist sans для спокойного набора.',
    sample: 'Мягкий\nритм',
    source: 'builtin',
    family: '"Trebuchet MS", "Verdana", sans-serif',
    fontStyle: 'normal',
    letterSpacing: 0.2,
    fontSize: 78,
    lineHeight: 1.24,
    align: 'left',
    color: '#433328',
    backgroundEnabled: false,
    backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
    backgroundStyle: DEFAULT_TEXT_BACKGROUND_STYLE,
    backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
  },
  {
    id: 'mono-note',
    label: 'Mono',
    description: 'Записка или план с характером monospace.',
    sample: 'plan\n/ note',
    source: 'builtin',
    family: '"Courier New", monospace',
    fontStyle: 'bold',
    letterSpacing: 0.9,
    fontSize: 76,
    lineHeight: 1.18,
    align: 'left',
    color: '#241d17',
    backgroundEnabled: false,
    backgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
    backgroundStyle: DEFAULT_TEXT_BACKGROUND_STYLE,
    backgroundOpacity: DEFAULT_TEXT_BACKGROUND_OPACITY,
  },
];

export const TEXT_STYLE_PRESETS = BUILT_IN_TEXT_STYLE_PRESETS;

export function getAvailableTextStylePresets(customPresets: TextStylePreset[] = []) {
  const merged = [...customPresets, ...BUILT_IN_TEXT_STYLE_PRESETS];
  const seen = new Set<string>();

  return merged.filter((preset) => {
    if (seen.has(preset.id)) {
      return false;
    }

    seen.add(preset.id);
    return true;
  });
}

export function getTextStylePresetById(id?: string | null, customPresets: TextStylePreset[] = []) {
  if (!id) return null;
  return getAvailableTextStylePresets(customPresets).find((preset) => preset.id === id) ?? null;
}

export function doesTextStylePresetMatchLayer(preset: TextStylePreset, layer: TextLayer) {
  return (
    preset.family === layer.fontFamily &&
    preset.fontStyle === (layer.fontStyle ?? 'normal') &&
    preset.letterSpacing === (layer.letterSpacing ?? 0) &&
    preset.fontSize === layer.fontSize &&
    preset.lineHeight === layer.lineHeight &&
    preset.align === layer.align &&
    preset.color === layer.color &&
    preset.backgroundEnabled === Boolean(layer.backgroundEnabled) &&
    preset.backgroundColor === (layer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR) &&
    preset.backgroundStyle === (layer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE) &&
    preset.backgroundOpacity === clampTextBackgroundOpacity(layer.backgroundOpacity)
  );
}

export function getNextCustomTextStylePresetLabel(customPresets: TextStylePreset[]) {
  const usedNumbers = customPresets.reduce<number[]>((numbers, preset) => {
    const match = /^Мой стиль (\d+)$/i.exec(preset.label.trim());
    if (!match) {
      return numbers;
    }

    return [...numbers, Number.parseInt(match[1], 10)];
  }, []);
  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return `Мой стиль ${nextNumber}`;
}

export function createCustomTextStylePreset(id: string, layer: TextLayer, label: string): TextStylePreset {
  const sampleSource = layer.text.replace(/\r/g, '').trim();
  const sampleLines = sampleSource
    ? sampleSource
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const sample =
    sampleLines.length > 0
      ? sampleLines
          .map((line) => (line.length > 14 ? `${line.slice(0, 14).trimEnd()}…` : line))
          .join('\n')
      : 'Мой\nстиль';

  return {
    id,
    label,
    description: layer.backgroundEnabled
      ? 'Сохранённый стиль с типографикой и плашкой.'
      : 'Сохранённый стиль текста без ручной пересборки.',
    sample,
    source: 'custom',
    family: layer.fontFamily,
    fontStyle: layer.fontStyle ?? 'normal',
    letterSpacing: layer.letterSpacing ?? 0,
    fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    align: layer.align,
    color: layer.color,
    backgroundEnabled: Boolean(layer.backgroundEnabled),
    backgroundColor: layer.backgroundColor ?? DEFAULT_TEXT_BACKGROUND_COLOR,
    backgroundStyle: layer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE,
    backgroundOpacity: clampTextBackgroundOpacity(layer.backgroundOpacity),
  };
}

export function isBuiltInFontFamily(family: string) {
  return BUILT_IN_FONT_OPTIONS.some((font) => font.family === family);
}

export function getFontOptions(fonts: UploadedFont[]): FontOption[] {
  const uploadedOptions: FontOption[] = fonts.map((font) => ({
    id: `uploaded-${font.id}`,
    name: font.id === 'default' ? 'System Sans' : font.name,
    family: font.family,
    source: font.id === 'default' ? 'builtin' : 'uploaded',
  }));

  const merged = [...uploadedOptions, ...BUILT_IN_FONT_OPTIONS];
  const seen = new Set<string>();

  return merged.filter((font) => {
    if (seen.has(font.family)) return false;
    seen.add(font.family);
    return true;
  });
}
