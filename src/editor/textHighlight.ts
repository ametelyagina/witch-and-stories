import { TextAlign, TextFontStyle, TextLayer } from './types';

export const DEFAULT_TEXT_BACKGROUND_COLOR = '#fff3e8';

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

  const contentWidth = Math.max(40, layer.width);
  const measureConfig: HighlightMeasureConfig = {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: layer.fontStyle,
    letterSpacing: layer.letterSpacing,
  };
  const lines = wrapTextToLines(layer.text, contentWidth, measureConfig);
  const lineBoxHeight = layer.fontSize * layer.lineHeight;
  const horizontalPadding = Math.max(14, layer.fontSize * 0.18);
  const verticalPadding = Math.max(6, layer.fontSize * 0.08);
  const highlightHeight = Math.min(
    lineBoxHeight,
    Math.max(layer.fontSize + verticalPadding * 2, 24),
  );
  const cornerRadius = Math.max(12, layer.fontSize * 0.2);

  return lines.reduce<TextHighlightRect[]>((rects, line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return rects;
    }

    const lineWidth = measureTextWidth(trimmedLine, measureConfig);
    const alignedX = getAlignedLineX(contentWidth, lineWidth, layer.align);
    const rectX = Math.max(0, alignedX - horizontalPadding);
    const rectWidth = Math.min(
      contentWidth - rectX,
      lineWidth + horizontalPadding * 2,
    );
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
