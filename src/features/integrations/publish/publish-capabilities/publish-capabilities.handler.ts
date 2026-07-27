import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { PublishCapabilitiesQuery } from './publish-capabilities.command';
import { PublishProviderRegistry } from '../../../../infrastructure/services/publishing/publish-provider.registry';

@QueryHandler(PublishCapabilitiesQuery)
export class PublishCapabilitiesQueryHandler implements IQueryHandler<PublishCapabilitiesQuery> {
  constructor(
    @Inject(_const.IPUBLISH_PROVIDER_REGISTRY)
    private readonly providerRegistry: PublishProviderRegistry,
  ) {}

  public async execute(
    query: PublishCapabilitiesQuery,
  ): Promise<Record<string, any>> {
    if (query.platform) {
      const provider = this.providerRegistry.getProvider(query.platform);
      return {
        [query.platform]: provider.getCapabilities(),
      };
    }

    const capabilities: Record<string, any> = {};
    for (const platform of this.providerRegistry.getSupportedPlatforms()) {
      const provider = this.providerRegistry.getProvider(platform);
      capabilities[platform] = provider.getCapabilities();
    }
    return capabilities;
  }
}
