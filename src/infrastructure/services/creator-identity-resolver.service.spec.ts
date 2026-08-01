import { CreatorIdentityResolver } from './creator-identity-resolver.service';
import { CreatorIdentitySource } from '../../domain/contracts/resolved-creator-identity.dto';

describe('CreatorIdentityResolver', () => {
  let resolver: CreatorIdentityResolver;

  beforeEach(() => {
    resolver = new CreatorIdentityResolver();
  });

  describe('LinkedAccount present', () => {
    it('uses LinkedAccount as primary source', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: 'TechGuru',
          profileImage: 'https://example.com/avatar.jpg',
          verified: true,
          externalUrl: 'https://youtube.com/@techguru',
          metaData: null,
          platform: 'youtube',
        },
        user: {
          id: 'u1',
          firstName: 'John',
          lastName: 'Smith',
          userName: 'jsmith',
        },
        importedMetadata: null,
      });

      expect(result.displayName).toBe('TechGuru');
      expect(result.handle).toBe('@TechGuru');
      expect(result.profileImage).toBe('https://example.com/avatar.jpg');
      expect(result.verified).toBe(true);
      expect(result.profileUrl).toBe('https://youtube.com/@techguru');
      expect(result.rawUserName).toBe('TechGuru');
      expect(result.platform).toBe('youtube');
      expect(result.source).toBe(CreatorIdentitySource.LINKED_ACCOUNT);
      expect(result.userId).toBe('u1');
    });

    it('uses metaData.displayName over userName when available', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: 'techguru',
          profileImage: null,
          verified: false,
          externalUrl: null,
          metaData: { displayName: 'Tech Guru' },
          platform: 'tiktok',
        },
        user: null,
        importedMetadata: null,
      });

      expect(result.displayName).toBe('Tech Guru');
      expect(result.rawUserName).toBe('techguru');
      expect(result.source).toBe(CreatorIdentitySource.LINKED_ACCOUNT);
    });

    it('falls through to imported metadata for profileImage when LinkedAccount has none', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: 'techguru',
          profileImage: null,
          verified: false,
          externalUrl: null,
          metaData: null,
          platform: 'youtube',
        },
        user: null,
        importedMetadata: {
          channelProfileImage: 'https://example.com/meta-avatar.jpg',
        },
      });

      expect(result.displayName).toBe('techguru');
      expect(result.profileImage).toBe('https://example.com/meta-avatar.jpg');
      expect(result.source).toBe(CreatorIdentitySource.LINKED_ACCOUNT);
    });

    it('falls through to null for profileImage when neither LinkedAccount nor metadata has one', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: 'techguru',
          profileImage: null,
          verified: false,
          externalUrl: null,
          metaData: null,
          platform: 'youtube',
        },
        user: null,
        importedMetadata: null,
      });

      expect(result.profileImage).toBeNull();
    });
  });

  describe('Imported metadata fallback', () => {
    it('uses imported metadata when no LinkedAccount', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: {
          id: 'u1',
          firstName: 'John',
          lastName: 'Smith',
          userName: 'jsmith',
        },
        importedMetadata: {
          channelName: 'Tech Guru',
          channelHandle: 'techguru',
          channelProfileImage: 'https://example.com/channel.jpg',
          channelUrl: 'https://youtube.com/@techguru',
        },
      });

      expect(result.displayName).toBe('Tech Guru');
      expect(result.handle).toBe('@techguru');
      expect(result.profileImage).toBe('https://example.com/channel.jpg');
      expect(result.profileUrl).toBe('https://youtube.com/@techguru');
      expect(result.verified).toBe(false);
      expect(result.rawUserName).toBeNull();
      expect(result.source).toBe(CreatorIdentitySource.IMPORTED_METADATA);
    });

    it('checks multiple metadata keys (channelName, creatorName, author, from)', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: null,
        importedMetadata: {
          author: 'reddit_user',
        },
      });

      expect(result.displayName).toBe('reddit_user');
      expect(result.source).toBe(CreatorIdentitySource.IMPORTED_METADATA);
    });
  });

  describe('User profile fallback', () => {
    it('uses user firstName + lastName when no LinkedAccount or metadata', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: {
          id: 'u1',
          firstName: 'John',
          lastName: 'Smith',
          userName: 'jsmith',
        },
        importedMetadata: null,
      });

      expect(result.displayName).toBe('John Smith');
      expect(result.handle).toBe('@jsmith');
      expect(result.profileImage).toBeNull();
      expect(result.verified).toBe(false);
      expect(result.rawUserName).toBeNull();
      expect(result.source).toBe(CreatorIdentitySource.USER_PROFILE);
      expect(result.userId).toBe('u1');
    });

    it('falls back to userName when firstName + lastName are empty', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: { id: 'u2', firstName: '', lastName: '', userName: 'jsmith' },
        importedMetadata: null,
      });

      expect(result.displayName).toBe('jsmith');
      expect(result.handle).toBe('@jsmith');
      expect(result.source).toBe(CreatorIdentitySource.USER_PROFILE);
    });
  });

  describe('Unknown creator fallback', () => {
    it('returns Unknown Creator when all sources are null', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: null,
        importedMetadata: null,
      });

      expect(result.displayName).toBe('Unknown Creator');
      expect(result.handle).toBe('');
      expect(result.profileImage).toBeNull();
      expect(result.verified).toBe(false);
      expect(result.rawUserName).toBeNull();
      expect(result.source).toBe(CreatorIdentitySource.UNKNOWN);
    });

    it('returns Unknown Creator when user has empty strings', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: { id: 'u3', firstName: '', lastName: '', userName: '' },
        importedMetadata: null,
      });

      expect(result.displayName).toBe('Unknown Creator');
      expect(result.handle).toBe('');
      expect(result.source).toBe(CreatorIdentitySource.UNKNOWN);
    });
  });

  describe('Handle normalization', () => {
    it('prefixes handle with @ when missing', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: 'john_doe',
          profileImage: null,
          verified: false,
          externalUrl: null,
          metaData: null,
          platform: 'instagram',
        },
        user: null,
        importedMetadata: null,
      });

      expect(result.handle).toBe('@john_doe');
    });

    it('does not double-prefix handle when already has @', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: '@MrBeast',
          profileImage: null,
          verified: false,
          externalUrl: null,
          metaData: null,
          platform: 'youtube',
        },
        user: null,
        importedMetadata: null,
      });

      expect(result.handle).toBe('@MrBeast');
    });

    it('returns empty string when handle is null', () => {
      const result = resolver.resolve({
        linkedAccount: null,
        user: { id: 'u3', firstName: '', lastName: '', userName: '' },
        importedMetadata: null,
      });

      expect(result.handle).toBe('');
    });
  });

  describe('Empty strings edge cases', () => {
    it('uses LinkedAccount userName even when empty (?? does not cascade on empty string)', () => {
      const result = resolver.resolve({
        linkedAccount: {
          userName: '',
          profileImage: '',
          verified: false,
          externalUrl: '',
          metaData: {},
          platform: '',
        },
        user: {
          id: 'u1',
          firstName: 'John',
          lastName: 'Smith',
          userName: 'jsmith',
        },
        importedMetadata: {},
      });

      expect(result.displayName).toBe('');
      expect(result.handle).toBe('');
      expect(result.source).toBe(CreatorIdentitySource.LINKED_ACCOUNT);
    });
  });
});
