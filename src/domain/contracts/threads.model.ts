import { ApiProperty } from '@nestjs/swagger';

export type ThreadsUserDataType = {
  id: string;
  username: string;
  name: string;
  profile_picture_url?: string;
}

export class ThreadsProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  threadsId: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;

  @ApiProperty({ default: false })
  allowImport: boolean;
}

export class ThreadsContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  externalId: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  imageUrl?: string;

  @ApiProperty({ required: false })
  videoUrl?: string;

  @ApiProperty({ required: false })
  link?: string;

  @ApiProperty({ required: false })
  createdAt?: string;
}

export class ThreadsSearchParamsModel {
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

  @ApiProperty({ required: false })
  bookmark?: string;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class ThreadsSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  result: {
    user: ThreadsProfileModel[];
    content: ThreadsContentModel[];
  };

  @ApiProperty({ required: false })
  bookmark?: string;

  constructor() {
    this.query = '';
    this.result = {
      user: [],
      content: [],
    };
  }
}
