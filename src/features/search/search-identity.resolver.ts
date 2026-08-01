import { Inject, Injectable } from '@nestjs/common';
import { SearchEntityType } from '../../domain/contracts/search/search-entity-type';
import { IndexDocument } from '../../domain/contracts/search/index-document.model';
import {
  CreatorIdentitySource,
  ResolvedCreatorIdentity,
} from '../../domain/contracts/resolved-creator-identity.dto';
import {
  ICREATOR_IDENTITY_RESOLVER,
  ICreatorIdentityResolver,
} from '../../domain/services/icreator-identity-resolver.service';

/**
 * Resolves the wire `creator` identity for a search document. Profiles are
 * already gaddr identities; content resolves through the canonical creator
 * identity resolver using the repository-projected creator signals plus the
 * imported metadata carried on the document.
 */
@Injectable()
export class SearchIdentityResolver {
  constructor(
    @Inject(ICREATOR_IDENTITY_RESOLVER)
    private readonly resolver: ICreatorIdentityResolver,
  ) {}

  resolve(document: IndexDocument): ResolvedCreatorIdentity | null {
    if (document.type === SearchEntityType.PROFILE) {
      return this.fromProfile(document);
    }

    if (document.creatorId) {
      const { firstName = '', lastName = '' } = this.splitName(
        document.creatorName,
      );
      return this.resolver.resolve({
        linkedAccount: null,
        user: {
          id: document.creatorId,
          firstName,
          lastName,
          userName: document.creatorUsername ?? null,
        },
        importedMetadata: (document.metadata as any) ?? null,
      });
    }

    return null;
  }

  private fromProfile(document: IndexDocument): ResolvedCreatorIdentity {
    const username = document.creatorUsername || '';
    return {
      displayName: document.title,
      handle: username ? this.normalizeHandle(username) : '',
      rawUserName: username || null,
      profileImage: document.creatorAvatar || null,
      verified: document.verified ?? false,
      profileUrl: null,
      platform: 'gaddr',
      source: CreatorIdentitySource.USER_PROFILE,
      userId: document.creatorId ?? null,
    };
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    if (!name) return { firstName: '', lastName: '' };
    const parts = name.trim().split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  private normalizeHandle(value: string): string {
    return value.startsWith('@') ? value : `@${value}`;
  }
}
