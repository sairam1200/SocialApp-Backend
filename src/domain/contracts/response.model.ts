import { ApiProperty } from "@nestjs/swagger";

export class ImportResponseModel {

  @ApiProperty()
  message: string;

  @ApiProperty()
  accessToken?: string;

  @ApiProperty()
  expiresIn: Date;
}