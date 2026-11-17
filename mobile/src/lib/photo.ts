import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { rgbaToThumbHash } from 'thumbhash';
import { base64, hex, photoHash } from '@bluesight/protocol';
import type { Photo } from './store';

/**
 * A profile photo becomes three things on the phone, once:
 *   s   320 px JPEG, ~12–20 KB — sent over Bluetooth and shown in Lite mode
 *   f   800 px JPEG, ~60 KB    — uploaded on Wi-Fi only
 *   th  thumbhash, ~25 bytes   — a colour blur shown instantly, everywhere, for free
 * Re-encoding also drops EXIF (including GPS) before anything leaves the phone.
 */
const BLE_PHOTO_TARGET = 22_000;

async function render(uri: string, width: number, compress: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width }); // height omitted (not null): the web implementation treats null as a size
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  if (!out.base64) throw new Error('could not encode photo');
  return out.base64;
}

const byteLen = (b64: string) => Math.floor((b64.replace(/=+$/, '').length * 3) / 4);

export async function processPhoto(uri: string): Promise<Photo> {
  let quality = 0.5;
  let width = 320;
  let s = await render(uri, width, quality);
  while (byteLen(s) > BLE_PHOTO_TARGET && quality > 0.2) {
    quality -= 0.1;
    width -= 20;
    s = await render(uri, width, quality);
  }
  const f = await render(uri, 800, 0.6);
  const tiny = await render(uri, 40, 0.9);
  const decoded = jpeg.decode(base64.decode(tiny), { useTArray: true, formatAsRGBA: true });
  const th = rgbaToThumbHash(decoded.width, decoded.height, decoded.data);
  const sBytes = base64.decode(s);
  return { s, f, th: base64.encode(th), hash: hex.encode(photoHash(sBytes)), sBytes: sBytes.length };
}

export async function pickProfilePhoto(): Promise<Photo | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 5],
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;
  return processPhoto(res.assets[0].uri);
}
