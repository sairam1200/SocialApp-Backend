import { PublishJob } from '../../entities/publishJob.entity';
import {
  PublishContent,
  PublishResult,
  ValidationResult,
  PlatformCapabilities,
  ProgressCallback,
} from './publishing.models';

export interface IPublishingProvider {
  readonly platform: string;

  validate(content: PublishContent): Promise<ValidationResult>;
  publish(
    job: PublishJob,
    content: PublishContent,
    onProgress: ProgressCallback,
  ): Promise<PublishResult>;
  supportsMedia(contentType: string, mediaType: string): boolean;
  normalizeError(error: unknown): {
    code: string;
    message: string;
    retryable: boolean;
  };
  getCapabilities(): PlatformCapabilities;
}
