import { ImageLayer } from '../editor/types';

export const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ошибка загрузки изображения.'));
    img.src = src;
  });
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
