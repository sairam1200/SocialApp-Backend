import { ApiProperty } from '@nestjs/swagger';

export interface LinkedInUserDataModel {
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
