import { RoleType } from "../enums";
import { ApiProperty } from '@nestjs/swagger';

export class RoleModel {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    description: string;

    @ApiProperty({ enum: RoleType })
    type: RoleType;

    @ApiProperty()
    permissionsCount: number;
}

export class RoleClaimModel {
    @ApiProperty()
    roleId: string;

    @ApiProperty()
    claimType: string;

    @ApiProperty()
    claimValue: string;

    @ApiProperty()
    selected: boolean;
}

export class PermissionModel {
    @ApiProperty()
    roleId: string;

    @ApiProperty()
    roleName: string;

    @ApiProperty({ type: [RoleClaimModel] })
    roleClaims: RoleClaimModel[];
}