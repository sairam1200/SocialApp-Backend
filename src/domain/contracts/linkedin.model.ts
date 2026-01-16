import { ApiProperty } from '@nestjs/swagger';

export type LinkedInUserDataType = {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: {
    displayImage?: string;
    'displayImage~'?: {
      elements?: Array<{
        identifiers?: Array<{
          identifier: string;
        }>;
        data?: {
          'com.linkedin.digitalmedia.mediaartifact.StillImage'?: {
            displaySize?: {
              width?: number;
              height?: number;
            };
          };
        };
      }>;
    };
  };
  vanityName?: string;
  headline?: string;
  industry?: string;
  location?: {
    country?: string;
    region?: string;
  };
}

export class LinkedInProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  headline: string;

  @ApiProperty()
  industry: string;

  @ApiProperty()
  location: string;

  @ApiProperty()
  linkedInId: string;

  @ApiProperty({ default: false })
  allowImport: boolean;

  @ApiProperty()
  profileImage: string;

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;
}

export class LinkedInContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  externalId: string;

  @ApiProperty({ required: false })
  text?: string;

  @ApiProperty({ required: false })
  commentary?: string;

  @ApiProperty({ required: false, type: Object })
  author?: any;

  @ApiProperty({ required: false })
  created?: string;

  @ApiProperty({ required: false })
  lastModified?: string;

  @ApiProperty({ required: false, type: Object })
  activity?: any;
}

export class LinkedInSearchParamsModel {
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
  start?: number;

  @ApiProperty({ required: false, default: false })
  forceRefresh?: boolean;
}

export class LinkedInSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty()
  result: {
    user: LinkedInProfileModel[];
    content: LinkedInContentModel[];
    companies: LinkedInProfileModel[];
  };

  @ApiProperty({ required: false })
  start?: number;

  @ApiProperty()
  count: number;

  constructor() {
    this.query = '';
    this.result = {
      user: [],
      content: [],
      companies: [],
    };
    this.count = 0;
  }
}