import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const MAX_SIDE = 2000;
const MAX_IMAGES = 5;

/**
 * Camera and gallery through Capacitor: native pickers on iOS/Android, a web fallback in the browser.
 * Every image is re-encoded as a JPEG (max 2000px), which also strips EXIF metadata such as location.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  async fromCamera(): Promise<Blob[]> {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 85,
      correctOrientation: true,
      saveToGallery: false
    });
    return photo.webPath ? [await toJpeg(photo.webPath)] : [];
  }

  async fromGallery(): Promise<Blob[]> {
    const result = await Camera.pickImages({ quality: 85, limit: MAX_IMAGES, correctOrientation: true });
    return Promise.all(result.photos.slice(0, MAX_IMAGES).map(p => toJpeg(p.webPath)));
  }
}

/** Cancelling the picker is not an error the user needs to see. */
export function isUserCancel(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return msg.includes('cancel') || msg.includes('no image picked') || msg.includes('user denied');
}

async function toJpeg(webPath: string): Promise<Blob> {
  const blob = await (await fetch(webPath)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85));
}
