import { ApiProperty } from "@nestjs/swagger";
import { UserModel } from "./user.model";
import { LinkedAccountModel } from "./user.model";
import { ManualProfileModel } from "./manualProfile.model";

export class ProfileModel {
  @ApiProperty({ type: UserModel })
  user: UserModel;

  @ApiProperty({ type: [LinkedAccountModel] })
  linkedAccounts: LinkedAccountModel[];

  @ApiProperty({ type: [ManualProfileModel] })
  manualProfiles: ManualProfileModel[];

  constructor(partial?: Partial<ProfileModel>) {
    Object.assign(this, partial);
  }
}

