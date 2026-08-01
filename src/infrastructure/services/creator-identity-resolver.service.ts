import { Injectable } from '@nestjs/common';
import { ICreatorIdentityResolver } from '../../domain/services/icreator-identity-resolver.service';
import {
  CreatorIdentitySource,
  ImportedCreatorMetadata,
  ResolvedCreatorIdentity,
} from '../../domain/contracts/resolved-creator-identity.dto';

@Injectable()
export class CreatorIdentityResolver implements ICreatorIdentityResolver {
  resolve(input: {
    linkedAccount: {
      userName: string;
      profileImage?: string | null;
      verified: boolean;
      externalUrl?: string | null;
      metaData?: Record<string, any> | null;
      platform: string;
    } | null;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      userName?: string | null;
    } | null;
    importedMetadata: ImportedCreatorMetadata | null;
  }): ResolvedCreatorIdentity {
    const la = input.linkedAccount;

    if (la) {
      const displayName =
        this.extractDisplayName(la.metaData) ??
        la.userName ??
        this.fallbackDisplayName(input.user);
      const handle = this.normalizeHandle(
        this.extractHandle(la.metaData) ?? la.userName,
      );
      const profileImage =
        la.profileImage ??
        this.extractProfileImage(input.importedMetadata) ??
        null;

      return {
        displayName,
        handle,
        rawUserName: la.userName ?? null,
        profileImage,
        verified: la.verified ?? false,
        profileUrl:
          la.externalUrl ??
          this.extractProfileUrl(input.importedMetadata) ??
          null,
        platform: la.platform ?? null,
        source: CreatorIdentitySource.LINKED_ACCOUNT,
        userId: input.user?.id ?? null,
      };
    }

    const md = input.importedMetadata;
    if (md) {
      const importedDisplayName = this.extractDisplayName(
        md as unknown as Record<string, any>,
      );
      const importedHandle = this.extractHandle(
        md as unknown as Record<string, any>,
      );
      if (importedDisplayName) {
        return {
          displayName: importedDisplayName,
          handle: this.normalizeHandle(importedHandle),
          rawUserName: null,
          profileImage: this.extractProfileImage(md) ?? null,
          verified: false,
          profileUrl: this.extractProfileUrl(md) ?? null,
          platform: null,
          source: CreatorIdentitySource.IMPORTED_METADATA,
          userId: input.user?.id ?? null,
        };
      }
    }

    const userFullName = this.fallbackDisplayName(input.user);
    if (userFullName) {
      return {
        displayName: userFullName,
        handle: this.normalizeHandle(input.user?.userName ?? null),
        rawUserName: null,
        profileImage: null,
        verified: false,
        profileUrl: null,
        platform: null,
        source: CreatorIdentitySource.USER_PROFILE,
        userId: input.user?.id ?? null,
      };
    }

    return {
      displayName: 'Unknown Creator',
      handle: '',
      rawUserName: null,
      profileImage: null,
      verified: false,
      profileUrl: null,
      platform: null,
      source: CreatorIdentitySource.UNKNOWN,
      userId: null,
    };
  }

  private extractDisplayName(
    metaData: Record<string, any> | null | undefined,
  ): string | null {
    if (!metaData) return null;
    return (
      metaData.displayName ??
      metaData.channelName ??
      metaData.creatorName ??
      metaData.author ??
      metaData.from ??
      null
    );
  }

  private extractHandle(
    metaData: Record<string, any> | null | undefined,
  ): string | null {
    if (!metaData) return null;
    return (
      metaData.handle ??
      metaData.channelHandle ??
      metaData.channelUsername ??
      metaData.username ??
      null
    );
  }

  private extractProfileImage(
    metaData: ImportedCreatorMetadata | null | undefined,
  ): string | null {
    if (!metaData) return null;
    return (
      (metaData as any).channelProfileImage ??
      (metaData as any).avatar ??
      (metaData as any).profileImage ??
      null
    );
  }

  private extractProfileUrl(
    metaData: ImportedCreatorMetadata | null | undefined,
  ): string | null {
    if (!metaData) return null;
    return (
      (metaData as any).channelUrl ??
      (metaData as any).profileUrl ??
      (metaData as any).externalUrl ??
      null
    );
  }

  private normalizeHandle(value: string | null): string {
    if (!value) return '';
    return value.startsWith('@') ? value : `@${value}`;
  }

  private fallbackDisplayName(
    user: {
      firstName: string;
      lastName: string;
      userName?: string | null;
    } | null,
  ): string {
    if (!user) return '';
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return fullName || user.userName || '';
  }
}
