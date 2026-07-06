// This file contains utility functions for string manipulation.
// It includes functions to convert strings to title case, capitalize the first letter,
// generate random strings, and generate random strings with custom characters and special characters.
export const stringUtil = {
  titleCase: (str: string): string => {
    return str
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  capitalizeFirstLetter: (str: string): string => {
    const words = str.split(' ');
    if (words.length === 0) return '';
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(' ');
  },

  generateSlug: (title: string): string => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  },

  generateRandomString: (length: number): string => {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return stringUtil.generateFromCharset(length, chars);
  },

  generateRandomNumberString: (length: number): string => {
    const chars = '0123456789';
    return stringUtil.generateFromCharset(length, chars);
  },

  generateRandomStringWithSpecialChars: (length: number): string => {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    return stringUtil.generateFromCharset(length, chars);
  },

  generateFromCharset: (length: number, chars: string): string => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  trimWithEllipsis(input: string, maxLength: number = 20): string {
    if (!input) return '';
    if (input.length <= maxLength) return input;

    const ellipsis = '...';
    const trimmedLength = maxLength - ellipsis.length;
    return input.slice(0, trimmedLength) + ellipsis;
  },

  extractInitialsFromName(name: string): string {
    const FORMAL_TITLES = [
      'Sir',
      "Ma'am",
      'Madam',
      'Mr',
      'Mrs',
      'Ms',
      'Miss',
      'Dr',
      'Professor',
    ];
    let cleaned = name;

    for (const title of FORMAL_TITLES) {
      const regex = new RegExp(`\\b${title}\\.?\\s*`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    cleaned = cleaned.replace(/\s+/g, ' ').replace(/,/g, '').trim();
    const words = cleaned.split(' ');

    const initials = words.map((word) => word.charAt(0).toUpperCase()).join('');
    return initials.slice(0, 2);
  },
};
