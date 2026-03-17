export type Preset = 'story' | 'carousel';

export type PresetDefinition = {
  key: Preset;
  label: string;
  width: number;
  height: number;
};

export const PRESETS: PresetDefinition[] = [
  { key: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
  { key: 'carousel', label: 'Carousel 4:5', width: 1080, height: 1350 },
];

export type UploadedFont = {
  id: string;
  name: string;
  family: string;
  dataUrl?: string;
};

export const DEFAULT_FONT: UploadedFont = {
  id: 'default',
  name: 'System',
  family: 'Arial',
};

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BaseLayer = {
  id: string;
  type: 'image' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type TextAlign = 'left' | 'center' | 'right';
export type TextFontStyle = 'normal' | 'bold' | 'italic' | 'bold italic';
export type TextBackgroundStyle = 'soft' | 'sharp' | 'cloud' | 'block' | 'frame' | 'sticker';

export type ImageLayer = BaseLayer & {
  type: 'image';
  kind?: 'background' | 'overlay';
  src: string;
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  crop: ImageCrop;
};

export type TextLayer = BaseLayer & {
  type: 'text';
  text: string;
  fontFamily: string;
  fontStyle?: TextFontStyle;
  letterSpacing?: number;
  fontSize: number;
  lineHeight: number;
  align: TextAlign;
  color: string;
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundStyle?: TextBackgroundStyle;
  stylePresetId?: string;
};

export type Layer = ImageLayer | TextLayer;

export type PersistedImageLayer = Omit<ImageLayer, 'image'>;
export type PersistedLayer = PersistedImageLayer | TextLayer;
