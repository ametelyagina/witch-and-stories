import { ImageCrop, ImageLayer } from '../editor/types';

export const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ошибка загрузки изображения.'));
    img.src = src;
  });
};

const FULL_IMAGE_CROP: ImageCrop = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const getImageSourceSize = (image: HTMLImageElement) => ({
  width: image.naturalWidth || image.width,
  height: image.naturalHeight || image.height,
});

export const rasterizeBackgroundImage = async ({
  image,
  crop = FULL_IMAGE_CROP,
  width,
  height,
}: {
  image: HTMLImageElement;
  crop?: ImageCrop;
  width: number;
  height: number;
}) => {
  const outputWidth = Math.max(1, Math.round(width));
  const outputHeight = Math.max(1, Math.round(height));
  const sourceSize = getImageSourceSize(image);
  const sourceX = (crop.x / 100) * sourceSize.width;
  const sourceY = (crop.y / 100) * sourceSize.height;
  const sourceWidth = Math.max(1, (crop.width / 100) * sourceSize.width);
  const sourceHeight = Math.max(1, (crop.height / 100) * sourceSize.height);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Не удалось подготовить изображение для сохранения.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const rasterizedImage = await loadImage(dataUrl);

  return {
    dataUrl,
    image: rasterizedImage,
    crop: FULL_IMAGE_CROP,
    naturalWidth: rasterizedImage.naturalWidth || outputWidth,
    naturalHeight: rasterizedImage.naturalHeight || outputHeight,
  };
};

export const readFileAsDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Не удалось считать файл.'));
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла.'));
    reader.readAsDataURL(file);
  });
};

export const preloadImageLayer = async (layer: Omit<ImageLayer, 'image'>) => {
  const image = await loadImage(layer.src);
  return {
    ...layer,
    image,
  } as ImageLayer;
};
