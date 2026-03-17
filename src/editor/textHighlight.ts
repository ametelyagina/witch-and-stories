import { TextAlign, TextBackgroundStyle, TextFontStyle, TextLayer } from './types';

export const DEFAULT_TEXT_BACKGROUND_COLOR = '#fff3e8';
export const DEFAULT_TEXT_BACKGROUND_STYLE: TextBackgroundStyle = 'soft';
export const TEXT_BACKGROUND_STYLE_OPTIONS: Array<{
  id: TextBackgroundStyle;
  label: string;
}> = [
  { id: 'soft', label: 'Soft' },
  { id: 'sharp', label: 'Sharp' },
  { id: 'block', label: 'Block' },
  { id: 'frame', label: 'Frame' },
];

type HighlightMeasureConfig = {
  fontFamily: string;
  fontSize: number;
  fontStyle?: TextFontStyle;
  letterSpacing?: number;
};

export type TextHighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
};

export type TextHighlightBlock = TextHighlightRect;

export function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (![3, 6].includes(hex.length)) {
    return color;
  }

  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

let measureCanvas: HTMLCanvasElement | null = null;
let measureContext: CanvasRenderingContext2D | null = null;

function getMeasureContext() {
  if (typeof document === 'undefined') {
    return null;
  }

  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
    measureContext = measureCanvas.getContext('2d');
  }

  return measureContext;
}

function buildCanvasFont({ fontFamily, fontSize, fontStyle }: HighlightMeasureConfig) {
  const isItalic = fontStyle?.includes('italic');
  const isBold = fontStyle?.includes('bold');
  const weight = isBold ? '700' : '500';
  const style = isItalic ? 'italic' : 'normal';
  return `${style} ${weight} ${fontSize}px ${fontFamily}`;
}

function measureTextWidth(text: string, config: HighlightMeasureConfig) {
  if (!text) {
    return 0;
  }

  const context = getMeasureContext();
  if (!context) {
    return text.length * config.fontSize * 0.6;
  }

  context.font = buildCanvasFont(config);
  const width = context.measureText(text).width;
  const spacing = Math.max(0, text.length - 1) * (config.letterSpacing ?? 0);
  return width + spacing;
}

function takeFittingChunk(
  text: string,
  maxWidth: number,
  config: HighlightMeasureConfig,
) {
  if (!text) {
    return '';
  }

  let chunk = '';
  for (const char of Array.from(text)) {
    const candidate = `${chunk}${char}`;
    if (chunk && measureTextWidth(candidate, config) > maxWidth) {
      break;
    }

    chunk = candidate;
  }

  return chunk || Array.from(text)[0] || '';
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  config: HighlightMeasureConfig,
) {
  if (!paragraph) {
    return [''];
  }

  const lines: string[] = [];
  const tokens = paragraph.split(/(\s+)/).filter(Boolean);
  let currentLine = '';

  for (const token of tokens) {
    const nextToken = currentLine ? token : token.replace(/^\s+/, '');
    if (!nextToken) {
      continue;
    }

    const candidate = `${currentLine}${nextToken}`;
    if (measureTextWidth(candidate, config) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd());
      currentLine = nextToken.replace(/^\s+/, '');
    } else {
      currentLine = nextToken.trim();
    }

    while (currentLine && measureTextWidth(currentLine, config) > maxWidth) {
      const chunk = takeFittingChunk(currentLine, maxWidth, config);
      lines.push(chunk);
      currentLine = currentLine.slice(chunk.length).replace(/^\s+/, '');
    }
  }

  if (currentLine || !lines.length) {
    lines.push(currentLine.trimEnd());
  }

  return lines;
}

function wrapTextToLines(text: string, width: number, config: HighlightMeasureConfig) {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  return paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, width, config));
}

function getAlignedLineX(width: number, lineWidth: number, align: TextAlign) {
  if (align === 'center') {
    return (width - lineWidth) / 2;
  }

  if (align === 'right') {
    return width - lineWidth;
  }

  return 0;
}

export function buildTextHighlightRects(layer: TextLayer) {
  if (!layer.backgroundEnabled) {
    return [];
  }

  const backgroundStyle = layer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE;
  const isBlockStyle = backgroundStyle === 'block' || backgroundStyle === 'frame';
  const contentWidth = Math.max(40, layer.width);
  const measureConfig: HighlightMeasureConfig = {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: layer.fontStyle,
    letterSpacing: layer.letterSpacing,
  };
  const lines = wrapTextToLines(layer.text, contentWidth, measureConfig);
  const lineBoxHeight = layer.fontSize * layer.lineHeight;
  const leadingPadding = isBlockStyle ? Math.max(28, layer.fontSize * 0.36) : Math.max(24, layer.fontSize * 0.3);
  const trailingPadding = isBlockStyle ? Math.max(18, layer.fontSize * 0.24) : Math.max(14, layer.fontSize * 0.18);
  const verticalPadding = isBlockStyle ? Math.max(10, layer.fontSize * 0.14) : Math.max(6, layer.fontSize * 0.08);
  const highlightHeight = isBlockStyle
    ? Math.max(layer.fontSize + verticalPadding * 2.1, lineBoxHeight)
    : Math.min(
        lineBoxHeight,
        Math.max(layer.fontSize + verticalPadding * 2, 24),
      );
  const cornerRadius =
    backgroundStyle === 'sharp'
      ? Math.max(6, layer.fontSize * 0.06)
      : backgroundStyle === 'frame'
        ? Math.max(14, layer.fontSize * 0.18)
        : Math.max(14, layer.fontSize * 0.22);

  return lines.reduce<TextHighlightRect[]>((rects, line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return rects;
    }

    const lineWidth = measureTextWidth(trimmedLine, measureConfig);
    const alignedX = getAlignedLineX(contentWidth, lineWidth, layer.align);
    const rectX = alignedX - leadingPadding;
    const rectWidth = lineWidth + leadingPadding + trailingPadding;
    const rectY = index * lineBoxHeight + (lineBoxHeight - highlightHeight) / 2;

    rects.push({
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: highlightHeight,
      cornerRadius,
    });

    return rects;
  }, []);
}

export function buildTextHighlightBlock(layer: TextLayer): TextHighlightBlock | null {
  const rects = buildTextHighlightRects(layer);
  if (rects.length === 0) {
    return null;
  }

  const backgroundStyle = layer.backgroundStyle ?? DEFAULT_TEXT_BACKGROUND_STYLE;
  const insetX = backgroundStyle === 'frame' ? Math.max(10, layer.fontSize * 0.12) : Math.max(8, layer.fontSize * 0.1);
  const insetY = backgroundStyle === 'frame' ? Math.max(12, layer.fontSize * 0.16) : Math.max(10, layer.fontSize * 0.12);
  const minX = Math.min(...rects.map((rect) => rect.x)) - insetX;
  const minY = Math.min(...rects.map((rect) => rect.y)) - insetY;
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width)) + insetX;
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height)) + insetY;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    cornerRadius:
      backgroundStyle === 'frame'
        ? Math.max(18, layer.fontSize * 0.22)
        : Math.max(24, layer.fontSize * 0.28),
  };
}
