interface ColorSet {
  backgroundColor: string;
  textColor: string;
}

/**
 * Generate a random hex color.
 */
function getRandomHexColor(): string {
  const randomInt = Math.floor(Math.random() * 0xFFFFFF);
  return `#${randomInt.toString(16).padStart(6, '0')}`;
}

/**
 * Generates a random background/text color pair with good contrast.
 */
export function generateRandomColorSet(): ColorSet {
  const backgroundColor = getRandomHexColor();

  const red = parseInt(backgroundColor.slice(1, 3), 16);
  const green = parseInt(backgroundColor.slice(3, 5), 16);
  const blue = parseInt(backgroundColor.slice(5, 7), 16);

  const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
  const textColor = luminance > 186 ? '#343a40' : '#ffffff';

  return { backgroundColor, textColor };
}