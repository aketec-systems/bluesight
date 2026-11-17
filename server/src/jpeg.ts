/**
 * Phones already re-encode photos before upload, which drops EXIF. This is the server-side guarantee:
 * remove every APP1–APP15 (EXIF, XMP, GPS…) and comment segment, keep the image data untouched.
 */
export function isJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) throw new Error('not a jpeg');
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('corrupt jpeg');
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) {
      i++; // fill bytes
      m = b[i + 1];
    }
    if (m === 0xda) {
      out.push(b.subarray(i)); // start of scan: the rest is image data
      break;
    }
    if (m === 0xd9 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) throw new Error('corrupt jpeg');
    const len = (b[i + 2] << 8) | b[i + 3];
    const end = i + 2 + len;
    if (len < 2 || end > b.length) throw new Error('corrupt jpeg');
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
    if (!drop) out.push(b.subarray(i, end));
    i = end;
  }
  const total = out.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}
