import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Injectable, OnModuleInit } from '@nestjs/common';

export interface VideoMetadata {
  container: string;
  videoCodec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  duration: number;
  rotation: number;
  isHdr: boolean;
}

@Injectable()
export class VideoCodecService implements OnModuleInit {
  private ffprobePath: string;
  public isAvailable: boolean = false;

  constructor() {
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      await this.runCommand(this.ffprobePath, ['-version']);
      this.isAvailable = true;
    } catch {
      this.isAvailable = false;
    }
  }

  async detect(filePath: string): Promise<VideoMetadata | null> {
    if (!this.isAvailable) return null;
    if (!fs.existsSync(filePath)) return null;

    try {
      const output = await this.runCommand(this.ffprobePath, [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);

      const data = JSON.parse(output);
      const videoStream = data.streams?.find(
        (s: any) => s.codec_type === 'video',
      );
      const audioStream = data.streams?.find(
        (s: any) => s.codec_type === 'audio',
      );

      if (!videoStream) return null;

      const container =
        path.extname(filePath).replace('.', '').toLowerCase() ||
        data.format?.format_name ||
        'unknown';
      return {
        container,
        videoCodec: (videoStream.codec_name || 'unknown').toLowerCase(),
        audioCodec: audioStream?.codec_name?.toLowerCase() || null,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        duration: parseFloat(data.format?.duration || '0'),
        rotation: parseInt(videoStream.rotation || '0', 10),
        isHdr:
          videoStream.pix_fmt === 'yuv420p10le' ||
          videoStream.pix_fmt === 'yuv422p10le' ||
          !!videoStream.color_transfer,
      };
    } catch {
      return null;
    }
  }

  isBrowserCompatible(metadata: VideoMetadata): boolean {
    const compatibleVideoCodecs = ['h264', 'avc1'];
    const compatibleAudioCodecs = ['aac', 'mp4a'];
    const compatibleContainers = ['mp4', 'mov'];

    const videoOk = compatibleVideoCodecs.includes(metadata.videoCodec);
    const audioOk =
      !metadata.audioCodec ||
      compatibleAudioCodecs.includes(metadata.audioCodec);
    const containerOk = compatibleContainers.includes(metadata.container);
    const notHdr = !metadata.isHdr;

    return videoOk && audioOk && containerOk && notHdr;
  }

  isTranscodingAvailable(): boolean {
    return this.isAvailable;
  }

  private runCommand(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `ffprobe exited with code ${code}`));
      });
    });
  }
}
