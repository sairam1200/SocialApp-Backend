import * as fs from 'fs';

const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov'] as const;

const CODEC_H264_BRANDS = [
  'avc1',
  'mp42',
  'mp41',
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'dash',
  'qt',
];
const CODEC_H265_BRANDS = ['hvc1', 'hev1'];

export interface VideoFormatValidationResult {
  valid: boolean;
  mimeType?: string;
  error?: string;
}

export function validateVideoExtension(fileName: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return (ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function detectMimeTypeFromMagicBytes(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 8) return null;

    const boxType = buffer.toString('ascii', 4, 8);

    if (boxType === 'ftyp') {
      if (bytesRead < 12) return 'video/mp4';
      const majorBrand = buffer.toString('ascii', 8, 12);
      if (majorBrand === 'qt  ') return 'video/quicktime';
      return 'video/mp4';
    }

    return null;
  } catch {
    return null;
  }
}

export function detectCodecFromFile(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    if (bytesRead < 12) return null;

    const bufferStr = buffer.toString('ascii', 0, bytesRead);

    const h265Match = CODEC_H265_BRANDS.some((brand) =>
      bufferStr.includes(brand),
    );
    if (h265Match) return 'h265';

    const h264Match = CODEC_H264_BRANDS.some((brand) =>
      bufferStr.includes(brand),
    );
    if (h264Match) return 'h264';

    return null;
  } catch {
    return null;
  }
}

export function validateVideoFile(
  filePath: string,
  originalName: string,
): VideoFormatValidationResult {
  if (!validateVideoExtension(originalName)) {
    const ext = '.' + originalName.split('.').pop()?.toLowerCase();
    return {
      valid: false,
      error: `Unsupported video format "${ext}". Please upload an MP4 or Apple MOV video encoded with H.264 video and AAC audio.`,
    };
  }

  const detectedMime = detectMimeTypeFromMagicBytes(filePath);
  if (!detectedMime) {
    return {
      valid: false,
      error:
        'Could not detect video format. Please upload a valid MP4 or Apple MOV file.',
    };
  }

  if (
    !(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(
      detectedMime as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
    )
  ) {
    return {
      valid: false,
      error: `Unsupported video format "${detectedMime}". Please upload an MP4 or Apple MOV video encoded with H.264 video and AAC audio.`,
    };
  }

  const codec = detectCodecFromFile(filePath);
  if (codec === 'h265') {
    return {
      valid: false,
      error:
        'This video uses an unsupported codec (HEVC/H.265). Please export your video as H.264 with AAC audio.',
    };
  }
  if (codec === null) {
    return {
      valid: false,
      error:
        'Could not detect video codec. Please upload a video encoded with H.264 video and AAC audio.',
    };
  }

  return { valid: true, mimeType: detectedMime };
}
