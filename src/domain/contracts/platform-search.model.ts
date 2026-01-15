import { ApiProperty } from '@nestjs/swagger';

export class PlatformSearchParamsModel {
  @ApiProperty()
  page: number;

  @ApiProperty()
  originalQuery: string;

  @ApiProperty()
  normalizedQuery: string;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  accessToken?: string;

  @ApiProperty()
  filters?: Record<string, any>;

  @ApiProperty({ required: false, description: 'Platform-agnostic pagination token. Can be a string (cursor/pageToken) or numeric string (offset/start). Will be mapped to platform-specific fields internally.' })
  paginationToken?: string;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

