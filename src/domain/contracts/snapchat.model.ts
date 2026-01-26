import { ApiProperty } from '@nestjs/swagger';

export type SnapchatUserDataType = {
  id: string;
  username: string;
  display_name: string;
  profile_image?: string;
  external_id?: string;
}

export class SnapchatProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  snapchatId: string;

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

export class SnapchatContentModel {
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

export class SnapchatSearchParamsModel {
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

export class SnapchatSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  result: {
    user: SnapchatProfileModel[];
    content: SnapchatContentModel[];
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
