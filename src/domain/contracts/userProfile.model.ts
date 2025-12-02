import { ApiProperty } from '@nestjs/swagger';

export class UserProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  displayName?: string;

  @ApiProperty()
  bio?: string;

  @ApiProperty()
  theme: string;

  @ApiProperty()
  settings: Record<string, unknown>;

  constructor(partial?: Partial<UserProfileModel>) {
    Object.assign(this, partial);
  }
}

export class CreateUserProfileModel {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  displayName?: string;

  @ApiProperty()
  bio?: string;

  @ApiProperty()
  theme?: string;
  @ApiProperty({ type: Object })
  settings?: Record<string, unknown>;
}

export class UpdateUserProfileModel {
  @ApiProperty()
  displayName?: string;
  @ApiProperty()
  bio?: string;
  @ApiProperty()
  theme?: string;
  @ApiProperty({ type: Object })
  settings?: Record<string, unknown>;
}
