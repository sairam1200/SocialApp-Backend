// This file contains utility functions for string manipulation.
// It includes functions to convert strings to title case, capitalize the first letter,
// generate random strings, and generate random strings with custom characters and special characters.
export const stringUtil = {
  titleCase: (str: string): string => {
    return str
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  capitalizeFirstLetter: (str: string): string => {
    const words = str.split(' ');
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(' ');
  },

  generateRandomString: (length: number): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  },

  generateRandomNumber: (length: number): string => {
    const characters = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  },

  generateRandomStringWithSpecialChars: (length: number): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  },

  generateRandomStringWithCustomChars: (length: number, customChars: string): string => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += customChars.charAt(Math.floor(Math.random() * customChars.length));
    }
    return result;
  },

  generateRandomStringWithCustomCharsAndLength: (length: number, customChars: string): string => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += customChars.charAt(Math.floor(Math.random() * customChars.length));
    }
    return result;
  },

  generateRandomStringWithCustomCharsAndLengthAndSpecialChars: (length: number, customChars: string): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  },

  generateRandomStringWithCustomCharsAndLengthAndSpecialCharsAndNumbers: (length: number, customChars: string): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  },

}