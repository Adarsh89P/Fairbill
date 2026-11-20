import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface Photo {
  uri: string;
  mimeType: string;
  width: number;
  height: number;
}

export class PhotoError extends Error {}

/**
 * Browsers only open the camera / file picker from inside the user's tap (iPhone Safari is strict about
 * this; Android Chrome is lenient). So on the web the picker is opened synchronously here, before any await.
 */
function webPick(source: 'camera' | 'library'): Promise<Photo | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (source === 'camera') input.setAttribute('capture', 'environment');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  const done = new Promise<Photo | null>((resolve, reject) => {
    const finish = (v: Photo | null, err?: unknown) => {
      input.remove();
      if (err) reject(err); else resolve(v);
    };
    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const reader = new FileReader();
      reader.onerror = () => finish(null, new PhotoError('Could not read that photo. Please try another one.'));
      reader.onload = () => {
        const uri = String(reader.result);
        const img = new window.Image();
        img.onload = () => finish({ uri, mimeType: file.type || 'image/jpeg', width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => finish(null, new PhotoError("That file doesn't look like a photo. Please choose a JPG or PNG."));
        img.src = uri;
      };
      reader.readAsDataURL(file);
    });
  });
  input.click();
  return done;
}

let started: { source: 'camera' | 'library'; photo: Promise<Photo | null> } | null = null;

/** Call inside the tap (before navigating to the scan screen) so the browser lets the camera open. No-op on phones. */
export function startBillPhoto(source: 'camera' | 'library'): void {
  if (Platform.OS !== 'web') return;
  started = { source, photo: webPick(source).then((p) => (p ? prepare(p) : null)) };
}

/** The photo picker opened by startBillPhoto, if any (taken once). */
export function takeStartedPhoto(): Promise<Photo | null> | null {
  const s = started;
  started = null;
  return s ? s.photo : null;
}

/** Camera or gallery, then a resize so uploads are fast but text stays sharp. Returns null if cancelled. */
export async function pickBillPhoto(source: 'camera' | 'library'): Promise<Photo | null> {
  if (Platform.OS === 'web') {
    const p = await webPick(source); // must stay the first thing here: it opens the picker inside the tap
    return p ? prepare(p) : null;
  }
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PhotoError('Camera access is off. Allow it in Settings, or upload a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return prepare({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', width: a.width, height: a.height });
}

async function prepare(p: Photo): Promise<Photo> {
  const MAX = 2200; // long edge; plenty for receipt text
  const long = Math.max(p.width, p.height);
  // Re-encoding a small photo only adds JPEG artifacts that hurt OCR; send it untouched on the web.
  // On phones, photos can carry an EXIF rotation that the server ignores, so bake it into the pixels
  // (otherwise the highlighted areas on the photo would point at the wrong place).
  if (!long || (long <= MAX && Platform.OS === 'web')) return p;
  if (long <= MAX) {
    try {
      const ref = await ImageManipulator.manipulate(p.uri).renderAsync();
      const out = await ref.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
      return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
    } catch {
      return p;
    }
  }
  try {
    const ctx = p.width >= p.height ? ImageManipulator.manipulate(p.uri).resize({ width: MAX }) : ImageManipulator.manipulate(p.uri).resize({ height: MAX });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
  } catch {
    return p; // fall back to the original photo
  }
}

/**
 * Profile photo: a small square JPEG as a data URI (~15 KB), so it can live in the app's settings.
 * On the web the picker opens inside the tap (call this straight from onPress).
 */
export async function pickProfilePhoto(): Promise<string | null> {
  const SIZE = 256;
  if (Platform.OS === 'web') {
    const p = await webPick('library');
    if (!p) return null;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new PhotoError("That file doesn't look like a photo."));
      i.src = p.uri;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return c.toDataURL('image/jpeg', 0.85);
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (res.canceled || !res.assets?.length) return null;
  const ref = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: SIZE, height: SIZE }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
}
