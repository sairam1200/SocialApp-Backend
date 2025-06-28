import { CqrsModule } from "@nestjs/cqrs";
import { Module } from '@nestjs/common';
import { GetProfileController } from "features/profile/get-profile/get-profile.endpoint";
import { GetProfileHandler } from "features/profile/get-profile/get-profile.handler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LinkedAccount, Role, RoleClaim, User, UserClaim, UserRole,UserLogin } from "domain/entities";
import { dependency } from "infrastructure/dependency";

@Module({
    imports: [
        CqrsModule,
        TypeOrmModule.forFeature([
            User, 
            LinkedAccount,
            UserClaim,
            Role,
            RoleClaim,
            UserRole,
            UserLogin
           
        ])
    ],
    controllers:[GetProfileController],
    providers:[
        GetProfileHandler,
        dependency.UserRepository,
        dependency.UserRoleRepository,
        dependency.UserLoginRepository,
        dependency.RoleRepository,
        dependency.LinkedAccountRepository,],
      
    exports:[]
})
export class ProfileModule { }