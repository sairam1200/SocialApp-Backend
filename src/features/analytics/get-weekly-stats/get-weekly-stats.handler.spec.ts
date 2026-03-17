import { Test, TestingModule } from '@nestjs/testing';
import { GetWeeklyStatsQueryHandler, GetWeeklyStatsQuery } from './get-weekly-stats.handler';
import _const from '../../../core/utils/const';

describe('GetWeeklyStatsQueryHandler', () => {
  let handler: GetWeeklyStatsQueryHandler;
  let mockPremiumRollupRepository: any;

  beforeEach(async () => {
    mockPremiumRollupRepository = {
      getRollupsByUserAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetWeeklyStatsQueryHandler,
        {
          provide: _const.IPREMIUMROLLUP_REPOSITORY,
          useValue: mockPremiumRollupRepository,
        },
      ],
    }).compile();

    handler = module.get<GetWeeklyStatsQueryHandler>(GetWeeklyStatsQueryHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should call getRollupsByUserAsync on repository', async () => {
    const userId = 'user-123';
    const mockRollups = [{ id: '1', userId }];
    mockPremiumRollupRepository.getRollupsByUserAsync.mockResolvedValue(mockRollups);

    const result = await handler.execute(new GetWeeklyStatsQuery({ userId }));

    expect(mockPremiumRollupRepository.getRollupsByUserAsync).toHaveBeenCalledWith(userId);
    expect(result).toEqual(mockRollups);
  });
});
