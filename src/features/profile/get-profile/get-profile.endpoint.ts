import { UserModel } from "../../../domain/contracts/user.model";
import { CommandBus } from "@nestjs/cqrs";
import { GetProfileQuery } from "./get-profile.handler";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiBearerAuth()
@ApiTags('Profile')
@UseGuards()
@Controller({
    path: `/profile`,
    version: '1',
})
export class GetProfileController {
    constructor(
        private readonly queryBus: CommandBus
    ) { }

    @Get()
    @ApiResponse({ status: 200, description: 'OK' })
    @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
    @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
    @ApiResponse({ status: 403, description: 'FORBIDDEN' })
    public async GetById(@Query('userId') userId: string): Promise<UserModel> {

        const result = await this.queryBus.execute(new GetProfileQuery({ userId }));

        return result;
    }
}