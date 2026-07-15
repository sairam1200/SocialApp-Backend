import { Injectable, Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { IPublishingProvider } from '../../../domain/services/publishing/ipublishing.provider';

@Injectable()
export class PublishProviderRegistry {
  private readonly providers = new Map<string, IPublishingProvider>();

  constructor(
    @Inject('IPUBLISHING_PROVIDERS')
    providers: IPublishingProvider[],
  ) {
    for (const provider of providers) {
      this.providers.set(provider.platform, provider);
      logger.info(
        `[PublishProviderRegistry] Registered provider: ${provider.platform}`,
      );
    }
  }

  getProvider(platform: string): IPublishingProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new Error(
        `No publishing provider registered for platform: ${platform}`,
      );
    }
    return provider;
  }

  hasProvider(platform: string): boolean {
    return this.providers.has(platform);
  }

  getSupportedPlatforms(): string[] {
    return Array.from(this.providers.keys());
  }
}
