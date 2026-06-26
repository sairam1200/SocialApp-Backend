import { Test, TestingModule } from '@nestjs/testing';
import { FacebookAnalyticsService } from './facebookAnalytics.service';
import _const from '../../core/utils/const';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserContent } from '../../domain/entities/userContent.entity';

describe('FacebookAnalyticsService', () => {
  let service: FacebookAnalyticsService;

  const mockPageRepo = {
    createOrUpdateAsync: jest.fn().mockImplementation((x) => Promise.resolve(x)),
    getLatestByUserIdAsync: jest.fn(),
    getTrendsAsync: jest.fn(),
  };

  const mockPostRepo = {
    createOrUpdateAsync: jest.fn().mockImplementation((x) => Promise.resolve(x)),
    getLatestByPostIdAsync: jest.fn(),
    getLatestByUserIdAsync: jest.fn(),
    getTrendsAsync: jest.fn(),
    getTopPostsAsync: jest.fn(),
  };

  const mockVideoRepo = {
    createOrUpdateAsync: jest.fn().mockImplementation((x) => Promise.resolve(x)),
    getLatestByVideoIdAsync: jest.fn(),
    getLatestByUserIdAsync: jest.fn(),
    getTrendsAsync: jest.fn(),
    getTopVideosAsync: jest.fn(),
  };

  const mockLinkedAccountRepo = {
    getByPlatformAndUserIdAsync: jest.fn(),
    getEntriesAsync: jest.fn(),
  };

  const mockUserLoginRepo = {
    getByUserIdAndProviderAsync: jest.fn(),
    updateAsync: jest.fn(),
  };

  const mockUserContentContext = {
    find: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookAnalyticsService,
        {
          provide: _const.IFACEBOOKPAGEANALYTICS_REPOSITORY,
          useValue: mockPageRepo,
        },
        {
          provide: _const.IFACEBOOKPOSTANALYTICS_REPOSITORY,
          useValue: mockPostRepo,
        },
        {
          provide: _const.IFACEBOOKVIDEOANALYTICS_REPOSITORY,
          useValue: mockVideoRepo,
        },
        {
          provide: _const.ILINKEDACCOUNT_REPOSITORY,
          useValue: mockLinkedAccountRepo,
        },
        {
          provide: _const.IUSERLOGIN_REPOSITORY,
          useValue: mockUserLoginRepo,
        },
        {
          provide: getRepositoryToken(UserContent),
          useValue: mockUserContentContext,
        },
      ],
    }).compile();

    service = module.get<FacebookAnalyticsService>(FacebookAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate mock fallback data when no login credentials exist', async () => {
    mockUserLoginRepo.getByUserIdAndProviderAsync.mockResolvedValue(null);

    await service.syncAccountAnalyticsAsync('test-user-id');

    expect(mockUserLoginRepo.getByUserIdAndProviderAsync).toHaveBeenCalledWith(
      'test-user-id',
      _const.PLATFORMS.FACEBOOK,
    );
    expect(mockPageRepo.createOrUpdateAsync).toHaveBeenCalled();
    expect(mockPostRepo.createOrUpdateAsync).toHaveBeenCalled();
  });
});
