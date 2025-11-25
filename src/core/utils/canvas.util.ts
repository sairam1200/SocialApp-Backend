import * as path from "path";
import { generateRandomColorSet } from "./color.util";
import { ApplicationException } from "../../core/exceptions";
import { createCanvas, loadImage, registerFont } from 'canvas';

const fontPath = path.resolve(
  process.cwd(),
  'public/assets/fonts/Poppins/Poppins-Medium.ttf'
);
registerFont(fontPath, {
  family: 'Poppins',
  weight: '500',
});

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
