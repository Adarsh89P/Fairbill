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

/** Camera or gallery, then a resize so uploads are fast but text stays sharp. Returns null if cancelled. */
export async function pickBillPhoto(source: 'camera' | 'library'): Promise<Photo | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
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
  // Re-encoding a small photo only adds JPEG artifacts that hurt OCR; send it untouched.
  if (!long || long <= MAX) return p;
  try {
    const ctx = p.width >= p.height ? ImageManipulator.manipulate(p.uri).resize({ width: MAX }) : ImageManipulator.manipulate(p.uri).resize({ height: MAX });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
  } catch {
    return p; // fall back to the original photo
  }
}
