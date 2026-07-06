import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import configs from '../../../configs';
import logger from '../../../core/utils/winston.util';

export interface R2StreamResult {
  stream: Readable;
  contentType?: string;
}

@Injectable()
export class R2StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const { accountId, bucket, accessKeyId, secretAccessKey, region } =
      configs.r2;
    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadStream(
    key: string,
    stream: Readable,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
    });
    await this.client.send(command);
    logger.info(`[R2Storage] Uploaded: ${key} (Content-Type: ${contentType})`);
  }

  async getStream(key: string): Promise<R2StreamResult> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.client.send(command);
    return {
      stream: response.Body as Readable,
      contentType: response.ContentType,
    };
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.client.send(command);
    logger.info(`[R2Storage] Deleted: ${key}`);
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
