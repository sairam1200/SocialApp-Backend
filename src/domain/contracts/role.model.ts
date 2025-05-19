import { RoleType } from "../enums";

export interface RoleModel {
    id: string;
    name: string;
    description: string;
    type: RoleType;
    permissionsCount: number;
}

export interface PermissionModel {
    roleId: string;
    roleName: string;
    roleClaims: RoleClaimModel[];
}

export interface RoleClaimModel {
    roleId: string;
    claimType: string;
    claimValue: string;
    selected: boolean;
}
