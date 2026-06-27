import { ApiProperty } from '@nestjs/swagger';

export class LinkedAccountModel {
  @ApiProperty()
  platform: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  profileUrl?: string;
}