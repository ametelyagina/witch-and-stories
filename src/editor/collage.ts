import { CollageLayout } from './types';

export type CollageSlot = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CollageLayoutDefinition = {
  key: CollageLayout;
  label: string;
  shortLabel: string;
  description: string;
  slotCount: number;
};

export const COLLAGE_LAYOUTS: CollageLayoutDefinition[] = [
  {
    key: 'grid-4',
    label: '4 кадра',
    shortLabel: '4',
    description: 'Сетка 2 на 2 с вертикальными карточками.',
    slotCount: 4,
  },
  {
    key: 'hero-top-3',
    label: 'Главный сверху',
    shortLabel: '1+3',
    description: 'Большой кадр сверху и три маленьких снизу.',
    slotCount: 4,
  },
  {
    key: 'hero-bottom-3',
    label: 'Главный снизу',
    shortLabel: '3+1',
    description: 'Три маленьких сверху и большой кадр снизу.',
    slotCount: 4,
  },
  {
    key: 'stack-2',
    label: '2 полосы',
    shortLabel: '2',
    description: 'Две горизонтальные фотографии одна над другой.',
    slotCount: 2,
  },
  {
    key: 'stack-3',
    label: '3 полосы',
    shortLabel: '3',
    description: 'Три горизонтальные фотографии сверху вниз.',
    slotCount: 3,
  },
];

export const getDefaultCollageOverscan = (layout: CollageLayout) => {
  if (layout === 'stack-2') {
    return 1.24;
  }

  if (layout === 'stack-3') {
    return 1.2;
  }

  if (layout === 'hero-top-3' || layout === 'hero-bottom-3') {
    return 1.18;
  }

  return 1.14;
};
export const COLLAGE_MIN_SPACING = 0;
export const COLLAGE_MAX_SPACING = 64;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const getDefaultCollageSpacing = (width: number, height: number) =>
  clamp(Math.round(Math.min(width, height) * 0.022), 18, 28);

const getFrameMetrics = (spacing: number, dividersEnabled = true) => {
  const frameSpacing = clamp(Math.round(spacing), COLLAGE_MIN_SPACING, COLLAGE_MAX_SPACING);
  return {
    outer: frameSpacing,
    gap: dividersEnabled ? frameSpacing : 0,
  };
};

const buildHeroStripSlots = (
  width: number,
  height: number,
  outer: number,
  gap: number,
  {
    heroOnTop,
  }: {
    heroOnTop: boolean;
  },
): CollageSlot[] => {
  const contentWidth = width - outer * 2;
  const contentHeight = height - outer * 2 - gap;
  const heroHeight = contentHeight * 0.72;
  const stripHeight = contentHeight - heroHeight;
  const stripSlotWidth = (contentWidth - gap * 2) / 3;
  const heroY = heroOnTop ? outer : outer + stripHeight + gap;
  const stripY = heroOnTop ? outer + heroHeight + gap : outer;

  return [
    {
      id: 'slot-1',
      label: 'Фото 1',
      x: outer,
      y: heroY,
      width: contentWidth,
      height: heroHeight,
    },
    {
      id: 'slot-2',
      label: 'Фото 2',
      x: outer,
      y: stripY,
      width: stripSlotWidth,
      height: stripHeight,
    },
    {
      id: 'slot-3',
      label: 'Фото 3',
      x: outer + stripSlotWidth + gap,
      y: stripY,
      width: stripSlotWidth,
      height: stripHeight,
    },
    {
      id: 'slot-4',
      label: 'Фото 4',
      x: outer + (stripSlotWidth + gap) * 2,
      y: stripY,
      width: stripSlotWidth,
      height: stripHeight,
    },
  ];
};

export const getCollageLayoutDefinition = (layout: CollageLayout) =>
  COLLAGE_LAYOUTS.find((item) => item.key === layout) ?? COLLAGE_LAYOUTS[0];

export const getCollageSlots = (
  layout: CollageLayout,
  width: number,
  height: number,
  spacing = getDefaultCollageSpacing(width, height),
  dividersEnabled = true,
): CollageSlot[] => {
  const { outer, gap } = getFrameMetrics(spacing, dividersEnabled);

  if (layout === 'hero-top-3') {
    return buildHeroStripSlots(width, height, outer, gap, {
      heroOnTop: true,
    });
  }

  if (layout === 'hero-bottom-3') {
    return buildHeroStripSlots(width, height, outer, gap, {
      heroOnTop: false,
    });
  }

  if (layout === 'stack-2') {
    const slotWidth = width - outer * 2;
    const slotHeight = (height - outer * 2 - gap) / 2;

    return [
      { id: 'slot-1', label: 'Фото 1', x: outer, y: outer, width: slotWidth, height: slotHeight },
      {
        id: 'slot-2',
        label: 'Фото 2',
        x: outer,
        y: outer + slotHeight + gap,
        width: slotWidth,
        height: slotHeight,
      },
    ];
  }

  if (layout === 'stack-3') {
    const slotWidth = width - outer * 2;
    const slotHeight = (height - outer * 2 - gap * 2) / 3;

    return [
      { id: 'slot-1', label: 'Фото 1', x: outer, y: outer, width: slotWidth, height: slotHeight },
      {
        id: 'slot-2',
        label: 'Фото 2',
        x: outer,
        y: outer + slotHeight + gap,
        width: slotWidth,
        height: slotHeight,
      },
      {
        id: 'slot-3',
        label: 'Фото 3',
        x: outer,
        y: outer + (slotHeight + gap) * 2,
        width: slotWidth,
        height: slotHeight,
      },
    ];
  }

  const slotWidth = (width - outer * 2 - gap) / 2;
  const slotHeight = (height - outer * 2 - gap) / 2;

  return [
    { id: 'slot-1', label: 'Фото 1', x: outer, y: outer, width: slotWidth, height: slotHeight },
    {
      id: 'slot-2',
      label: 'Фото 2',
      x: outer + slotWidth + gap,
      y: outer,
      width: slotWidth,
      height: slotHeight,
    },
    {
      id: 'slot-3',
      label: 'Фото 3',
      x: outer,
      y: outer + slotHeight + gap,
      width: slotWidth,
      height: slotHeight,
    },
    {
      id: 'slot-4',
      label: 'Фото 4',
      x: outer + slotWidth + gap,
      y: outer + slotHeight + gap,
      width: slotWidth,
      height: slotHeight,
    },
  ];
};

export const getSlotCoverPlacement = (
  slot: Pick<CollageSlot, 'x' | 'y' | 'width' | 'height'>,
  sourceWidth: number,
  sourceHeight: number,
  { overscan = 1 }: { overscan?: number } = {},
) => {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const scale = Math.max(slot.width / safeSourceWidth, slot.height / safeSourceHeight) * Math.max(1, overscan);
  const width = safeSourceWidth * scale;
  const height = safeSourceHeight * scale;

  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height,
  };
};

export const getMinimumCoverSize = (
  slot: Pick<CollageSlot, 'width' | 'height'>,
  aspectRatio: number,
) => {
  const safeAspectRatio = aspectRatio > 0 ? aspectRatio : 1;
  const height = Math.max(slot.height, slot.width / safeAspectRatio);
  const width = height * safeAspectRatio;
  return { width, height };
};

export const clampCollageImageGeometry = (
  slot: Pick<CollageSlot, 'x' | 'y' | 'width' | 'height'>,
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  aspectRatio: number,
) => {
  const safeAspectRatio = aspectRatio > 0 ? aspectRatio : geometry.width / Math.max(geometry.height, 1);
  let width = Math.max(1, geometry.width);
  let height = Math.max(1, geometry.height);

  if (Math.abs(width / height - safeAspectRatio) > 0.001) {
    height = width / safeAspectRatio;
  }

  const minimum = getMinimumCoverSize(slot, safeAspectRatio);
  if (width < minimum.width || height < minimum.height) {
    const scale = Math.max(minimum.width / width, minimum.height / height);
    width *= scale;
    height *= scale;
  }

  const x = clamp(geometry.x, slot.x + slot.width - width, slot.x);
  const y = clamp(geometry.y, slot.y + slot.height - height, slot.y);

  return {
    x,
    y,
    width,
    height,
  };
};

export const getCollageScaleFromGeometry = (
  slot: Pick<CollageSlot, 'width' | 'height'>,
  geometry: Pick<CollageSlot, 'width' | 'height'>,
) => {
  const aspectRatio = geometry.width / Math.max(geometry.height, 1);
  if (!(aspectRatio > 0)) {
    return 1;
  }

  const minimum = getMinimumCoverSize(slot, aspectRatio);
  return minimum.width > 0 ? geometry.width / minimum.width : 1;
};

export const scaleCollageGeometry = (
  slot: Pick<CollageSlot, 'x' | 'y' | 'width' | 'height'>,
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  nextScale: number,
) => {
  const aspectRatio = geometry.width / Math.max(geometry.height, 1);
  if (!(aspectRatio > 0)) {
    return geometry;
  }

  const minimum = getMinimumCoverSize(slot, aspectRatio);
  const clampedScale = Math.max(1, nextScale);
  const overflowX = Math.max(0, geometry.width - slot.width);
  const overflowY = Math.max(0, geometry.height - slot.height);
  const focusX = overflowX === 0 ? 0.5 : clamp((slot.x - geometry.x) / overflowX, 0, 1);
  const focusY = overflowY === 0 ? 0.5 : clamp((slot.y - geometry.y) / overflowY, 0, 1);
  const width = minimum.width * clampedScale;
  const height = minimum.height * clampedScale;

  return clampCollageImageGeometry(
    slot,
    {
      x: slot.x - (width - slot.width) * focusX,
      y: slot.y - (height - slot.height) * focusY,
      width,
      height,
    },
    aspectRatio,
  );
};

export const remapCollageGeometry = (
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  previousSlot: Pick<CollageSlot, 'x' | 'y' | 'width' | 'height'>,
  nextSlot: Pick<CollageSlot, 'x' | 'y' | 'width' | 'height'>,
) => {
  const aspectRatio = geometry.width / Math.max(geometry.height, 1);
  if (!(aspectRatio > 0)) {
    return getSlotCoverPlacement(nextSlot, 1, 1);
  }

  const previousMinimum = getMinimumCoverSize(previousSlot, aspectRatio);
  const nextMinimum = getMinimumCoverSize(nextSlot, aspectRatio);
  const zoom = previousMinimum.width > 0 ? geometry.width / previousMinimum.width : 1;
  const overflowX = Math.max(0, geometry.width - previousSlot.width);
  const overflowY = Math.max(0, geometry.height - previousSlot.height);
  const focusX = overflowX === 0 ? 0.5 : clamp((previousSlot.x - geometry.x) / overflowX, 0, 1);
  const focusY = overflowY === 0 ? 0.5 : clamp((previousSlot.y - geometry.y) / overflowY, 0, 1);
  const width = nextMinimum.width * Math.max(zoom, 1);
  const height = nextMinimum.height * Math.max(zoom, 1);

  return clampCollageImageGeometry(
    nextSlot,
    {
      x: nextSlot.x - (width - nextSlot.width) * focusX,
      y: nextSlot.y - (height - nextSlot.height) * focusY,
      width,
      height,
    },
    aspectRatio,
  );
};
