import { DEFAULT_FONT, TextAlign, TextFontStyle, UploadedFont } from './types';

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
  family: string;
  fontStyle: TextFontStyle;
  letterSpacing: number;
  fontSize: number;
  lineHeight: number;
  align: TextAlign;
  color: string;
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

export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: 'story-clean',
    label: 'Clean',
    description: 'Чистый базовый sans для быстрых сторис.',
    sample: 'Быстро и чисто',
    family: DEFAULT_FONT.family,
    fontStyle: 'bold',
    letterSpacing: 0,
    fontSize: 84,
    lineHeight: 1.08,
    align: 'left',
    color: '#241d17',
  },
  {
    id: 'editorial-serif',
    label: 'Editorial',
    description: 'Сдержанный serif для цитат и заголовков.',
    sample: 'Тихий акцент',
    family: 'Georgia, "Times New Roman", serif',
    fontStyle: 'italic',
    letterSpacing: 0,
    fontSize: 92,
    lineHeight: 1.12,
    align: 'left',
    color: '#2e2118',
  },
  {
    id: 'poster-bold',
    label: 'Poster',
    description: 'Плотный display-стиль для крупных фраз.',
    sample: 'Смело',
    family: 'Impact, "Arial Black", sans-serif',
    fontStyle: 'normal',
    letterSpacing: 1.4,
    fontSize: 120,
    lineHeight: 0.92,
    align: 'left',
    color: '#241d17',
  },
  {
    id: 'soft-humanist',
    label: 'Soft',
    description: 'Мягкий humanist sans для спокойного набора.',
    sample: 'Дышащий текст',
    family: '"Trebuchet MS", "Verdana", sans-serif',
    fontStyle: 'normal',
    letterSpacing: 0.2,
    fontSize: 78,
    lineHeight: 1.24,
    align: 'left',
    color: '#433328',
  },
  {
    id: 'mono-note',
    label: 'Mono',
    description: 'Записка или план с характером monospace.',
    sample: 'plan / note',
    family: '"Courier New", monospace',
    fontStyle: 'bold',
    letterSpacing: 0.9,
    fontSize: 76,
    lineHeight: 1.18,
    align: 'left',
    color: '#241d17',
  },
];

export function getTextStylePresetById(id?: string | null) {
  if (!id) return null;
  return TEXT_STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
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
