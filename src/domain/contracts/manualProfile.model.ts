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
