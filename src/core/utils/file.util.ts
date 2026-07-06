import * as fs from 'fs';
import * as path from 'path';
const basePath = path.join(process.cwd(), 'public/');
import { ApplicationException } from '../../core/exceptions';

function readFileAsString(filePath: string): string {
  try {
    const absolutePath = path.resolve(path.join(basePath, filePath));
    return fs.readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    throw new ApplicationException(
      `Error reading file at ${filePath}: ${error.message}`,
    );
  }
}

async function readFileAsStringAsync(filePath: string): Promise<string> {
  try {
    const absolutePath = path.resolve(path.join(basePath, filePath));
    const data = await fs.promises.readFile(absolutePath, 'utf-8');
    return data;
  } catch (error) {
    throw new ApplicationException(
      `Error reading file at ${filePath}: ${error.message}`,
    );
  }
}

function readFileAsBuffer(filePath: string): Buffer {
  try {
    const absolutePath = path.resolve(path.join(basePath, filePath));
    return fs.readFileSync(absolutePath);
  } catch (error) {
    throw new ApplicationException(
      `Error reading file at ${filePath}: ${error.message}`,
    );
  }
}

async function readFileAsBufferAsync(filePath: string): Promise<Buffer> {
  try {
    const absolutePath = path.resolve(path.join(basePath, filePath));
    const data = await fs.promises.readFile(absolutePath);
    return data;
  } catch (error) {
    throw new ApplicationException(
      `Error reading file at ${filePath}: ${error.message}`,
    );
  }
}

export default {
  readFileAsString,
  readFileAsBuffer,
  readFileAsStringAsync,
  readFileAsBufferAsync,
};
