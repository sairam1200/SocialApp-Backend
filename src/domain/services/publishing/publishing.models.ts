export interface PublishContent {
  title: string;
  description?: string;
  tags?: string[];
  visibility?: string;
  r2Key: string;
  fileSize?: number;
  contentType: string;
  publishAt?: Date;
  metadata?: Record<string, any>;
}

export interface PublishResult {
  platformContentId: string;
  platformContentUrl: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface PlatformCapabilities {
  supportedMediaTypes: string[];
  maxFileSizeBytes: number;
  maxDurationSec?: number;
  maxTitleLength?: number;
  maxDescriptionLength?: number;
  supportsScheduledPublish: boolean;
  supportsTags: boolean;
}

export type ProgressCallback = (progress: number, message: string) => void;
