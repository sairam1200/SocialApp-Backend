import { ApiProperty } from "@nestjs/swagger";

export class UserModel {
    @ApiProperty()
    id: string;

    @ApiProperty({ required: false, nullable: true })
    email: string | null;

    @ApiProperty()
    firstName: string;

    @ApiProperty()
    lastName: string;

    @ApiProperty({ required: false, nullable: true })
    isEmailVerified: boolean | null;

    @ApiProperty()
    gender: string;

    @ApiProperty({ required: false, nullable: true })
    phoneNumber: string | null;

    @ApiProperty()
    photo: string;

    constructor(partial?: Partial<UserModel>) {
        Object.assign(this, partial);
    }
}
export class LinkedAccountModel {
    @ApiProperty()
    id: string;

    @ApiProperty()
    platform:string;

    @ApiProperty()
    username:string;

    @ApiProperty({ default: false })
    isImported:boolean;

    @ApiProperty()
    externalId:string;

    @ApiProperty()
    externalUrl:string;

    @ApiProperty({ default: 0 })
    followersCount:number;

    @ApiProperty({ default: 0 })
    followingCount:number;

    @ApiProperty({ default: false })
    isVerified:boolean;

    constructor(partial?: Partial<LinkedAccountModel>) {
        Object.assign(this, partial);
    }
}