import { spawn } from 'child_process';
import * as fs from 'fs';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SHORTS_CONFIG } from './video-codec.service';
import logger from '../../core/utils/winston.util';

@Injectable()
export class VideoTranscodingService implements OnModuleInit {
  private ffmpegPath: string;
  public isAvailable: boolean = false;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const resolvedPath = process.env.FFMPEG_PATH || 'ffmpeg';
    try {
      const output = await this.runCommand(resolvedPath, ['-version']);
      const firstLine = output.split('\n')[0]?.trim() || 'unknown';
      logger.info(
        `[VideoTranscodingService] FFmpeg available: path="${resolvedPath}" version="${firstLine}"`,
      );
      this.isAvailable = true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      logger.warn(
        `[VideoTranscodingService] FFmpeg NOT available: path="${resolvedPath}" error="${msg}" ` +
          `— Set FFMPEG_PATH env var to a valid ffmpeg executable path`,
      );
      this.isAvailable = false;
    }
  }

  async transcodeToCompatible(
    inputPath: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('FFmpeg is not available on this system');
    }
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    await this.runCommand(
      this.ffmpegPath,
      [
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-profile:v',
        'high',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ],
      onProgress,
    );
  }

  async transcodeToShortsLetterbox(
    inputPath: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('FFmpeg is not available on this system');
    }
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    const vf = [
      `scale=${SHORTS_CONFIG.TARGET_WIDTH}:${SHORTS_CONFIG.TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${SHORTS_CONFIG.TARGET_WIDTH}:${SHORTS_CONFIG.TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    ].join(',');

    await this.runCommand(
      this.ffmpegPath,
      [
        '-i',
        inputPath,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-profile:v',
        'high',
        '-crf',
        '18',
        '-maxrate',
        '8M',
        '-bufsize',
        '16M',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ],
      onProgress,
    );
  }

  getOutputExtension(): string {
    return '.mp4';
  }

  private runCommand(
    cmd: string,
    args: string[],
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stderr = '';

      if (onProgress) {
        proc.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stderr += text;
          const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (match) {
            onProgress(0);
          }
        });
      } else {
        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
      }

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve(stderr);
        else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      });
    });
  }
}
