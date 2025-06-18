import { generateRandomColorSet } from "./color.util";

/**
 * Generates an image (as a base64 PNG) with initials on a colored background.
 * Canvas API used, available in browsers.
 */
export function generateInitialImage(initials: string, size = 200): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context not available');

  const { backgroundColor, textColor } = generateRandomColorSet();

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  // Text
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.floor(size / 3)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2);

  // Return image as base64 PNG
  return canvas.toDataURL('image/png');
}
