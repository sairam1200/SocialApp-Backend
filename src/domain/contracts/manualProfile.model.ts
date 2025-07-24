import { ApiProperty } from "@nestjs/swagger";

export class CreateManualProfileModel {
  @ApiProperty()
  url: string;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  icon: string;
}

export class UpdateManualProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  platform: string;

  @ApiProperty()
  icon: string;
}

export class ManualProfileModel extends UpdateManualProfileModel {
  @ApiProperty({ default: 0 })
  displayOrder?: number;
}

export class ManualProfileSearchResponseModel extends ManualProfileModel {
  @ApiProperty({
    type: 'object',
    properties: {
      userName: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      profileImage: { type: 'string' },
    },
  })
  user: {
    userName: string;
    firstName: string;
    lastName: string;
    profileImage: string;
  };
}
