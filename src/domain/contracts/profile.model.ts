import { ApiProperty } from "@nestjs/swagger";
import { UserModel } from "./user.model";
import { LinkedAccountModel } from "./user.model";
import { ManualProfileModel } from "./manualProfile.model";
import { ProfileImagePrivacy } from "domain/enums";

export class ProfileModel extends UserModel {

  @ApiProperty({ enum: ProfileImagePrivacy })
  photoPrivacy: ProfileImagePrivacy;

  @ApiProperty({ type: [LinkedAccountModel] })
  linkedAccounts: LinkedAccountModel[];

  @ApiProperty({ type: [ManualProfileModel] })
  manualProfiles: ManualProfileModel[];

  @ApiProperty({ default: 0 })
  followersCount: number;

  @ApiProperty({ default: 0 })
  followingCount: number;

  @ApiProperty({ default: false })
  isFollowing: boolean;

  constructor(partial?: Partial<ProfileModel>) {
    super();
    Object.assign(this, partial);
  }
}
