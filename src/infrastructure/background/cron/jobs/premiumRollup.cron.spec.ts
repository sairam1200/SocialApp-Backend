import { Test, TestingModule } from '@nestjs/testing';
import { PremiumRollupCron } from './premiumRollup.cron';
import _const from '../../../../core/utils/const';

describe('PremiumRollupCron', () => {
  let cron: PremiumRollupCron;
  let mockAnalyticsRepository: any;
  let mockPremiumRollupRepository: any;

  beforeEach(async () => {
    mockAnalyticsRepository = {
      getAllEventsAsync: jest.fn(),
    };
    mockPremiumRollupRepository = {
      upsertRollupAsync: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PremiumRollupCron,
        {
          provide: _const.IANALYTICS_REPOSITORY,
          useValue: mockAnalyticsRepository,
        },
        {
          provide: _const.IPREMIUMROLLUP_REPOSITORY,
          useValue: mockPremiumRollupRepository,
        },
      ],
    }).compile();

    cron = module.get<PremiumRollupCron>(PremiumRollupCron);
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  it('should aggregate events by user and upsert rollups', async () => {
    // Mock events from the last 7 days
    const mockEvents = [
      { userId: 'user1', eventName: 'VIDEO_PLAY' },
      { userId: 'user1', eventName: 'VIDEO_PLAY' },
      { userId: 'user1', eventName: 'FEATURE_CLICK' },
      { userId: 'user2', eventName: 'FEATURE_CLICK' },
    ];

    mockAnalyticsRepository.getAllEventsAsync.mockResolvedValue(mockEvents);

    await cron.handleWeeklyRollup();

    // Verify user1 aggregation
    expect(mockPremiumRollupRepository.upsertRollupAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user1',
        totalInteractions: 3,
        topFeatureUsed: 'VIDEO_PLAY',
        interactionBreakdown: {
          VIDEO_PLAY: 2,
          FEATURE_CLICK: 1,
        },
      }),
    );

    // Verify user2 aggregation
    expect(mockPremiumRollupRepository.upsertRollupAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user2',
        totalInteractions: 1,
        topFeatureUsed: 'FEATURE_CLICK',
        interactionBreakdown: {
          FEATURE_CLICK: 1,
        },
      }),
    );
  });
});
