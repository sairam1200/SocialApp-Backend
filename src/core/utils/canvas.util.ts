import * as fs from 'fs';
import * as path from 'path';
import { generateRandomColorSet } from './color.util';
import { ApplicationException } from '../../core/exceptions';
import { createCanvas, loadImage, registerFont } from 'canvas';

const fontPath = path.resolve(
  process.cwd(),
  'public/assets/fonts/Poppins/Poppins-Medium.ttf',
);

try {
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, {
      family: 'Poppins',
      weight: '500',
    });
  } else {
    console.warn(`[canvas] Font not found at ${fontPath} — using system defaults`);
  }
} catch (err) {
  console.warn(`[canvas] registerFont failed: ${(err as Error).message}`);
}

/**
 * Generates an image (as a base64 PNG) with initials on a colored background.
 * Canvas API used, available in browsers.
 */
export function generateInitialImage(initials: string, size = 200): string {
  const { backgroundColor, textColor } = generateRandomColorSet();
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new ApplicationException('Canvas context not available');

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  // Text
  ctx.fillStyle = textColor;
  ctx.font = `500 ${Math.floor(size / 3)}px Poppins`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2);

  // Return image as base64 PNG
  return canvas.toDataURL('image/png');
}
