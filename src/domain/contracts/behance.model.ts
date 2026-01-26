import { ApiProperty } from '@nestjs/swagger';

export type BehanceUserDataType = {
  id: string;
  username: string;
  display_name: string;
  profile_image?: string;
  location?: string;
  occupation?: string;
}

export class BehanceProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  behanceId: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ required: false })
  location?: string;

  @ApiProperty({ required: false })
  occupation?: string;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;

  @ApiProperty({ default: 0 })
  projectCount: number;

  @ApiProperty({ default: false })
  allowImport: boolean;
}

export class BehanceContentModel {
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
  link?: string;

  @ApiProperty({ required: false })
  createdAt?: string;

  @ApiProperty({ required: false, default: 0 })
  views?: number;

  @ApiProperty({ required: false, default: 0 })
  likes?: number;
}

export class BehanceSearchParamsModel {
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

export class BehanceSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  result: {
    user: BehanceProfileModel[];
    content: BehanceContentModel[];
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
