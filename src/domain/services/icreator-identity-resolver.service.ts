import { LinkedAccount } from '../entities/linkedAccount.entity';
import { User } from '../entities/identity/user.entity';
import {
  ImportedCreatorMetadata,
  ResolvedCreatorIdentity,
} from '../contracts/resolved-creator-identity.dto';

export const ICREATOR_IDENTITY_RESOLVER = 'ICreatorIdentityResolver';

/**
 * Canonical creator identity resolver.
 *
 * Converts LinkedAccount, imported metadata, and User information
 * into a normalized creator identity.
 *
 * No database access.
 * No HTTP context.
 * No privacy decisions.
 * No caching.
 * Pure synchronous transformation.
 *
 * This is the single source of truth for creator identity resolution
 * across all content surfaces (Discover, Search, Bookmarks, etc.).
 * New endpoints MUST reuse this resolver rather than reimplementing
 * fallback logic inline.
 */
export interface ICreatorIdentityResolver {
  resolve(input: {
    linkedAccount: Pick<
      LinkedAccount,
      | 'userName'
      | 'profileImage'
      | 'verified'
      | 'externalUrl'
      | 'metaData'
      | 'platform'
    > | null;
    user: Pick<User, 'id' | 'firstName' | 'lastName' | 'userName'> | null;
    importedMetadata: ImportedCreatorMetadata | null;
  }): ResolvedCreatorIdentity;
}
