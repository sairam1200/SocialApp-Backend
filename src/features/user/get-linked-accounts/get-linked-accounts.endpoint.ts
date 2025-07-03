import { UserModel } from "../../../domain/contracts/user.model";
import { CommandBus } from "@nestjs/cqrs";
import { GetUserLinkedAccountsQuery } from "./get-linked-accounts.handler";
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiBearerAuth()
@ApiTags('Users')
@UseGuards()
@Controller({
    path: `/user`,
    version: '1',
})
export class GetUserLinkedAccountsController {
    constructor(
        private readonly queryBus: CommandBus
    ) { }

    @Get("linked-accounts")
    @ApiResponse({ status: 200, description: 'OK' })
    @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
    @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
    @ApiResponse({ status: 403, description: 'FORBIDDEN' })
    public async GetById(@Query('userId') userId: string): Promise<UserModel> {

        const result = await this.queryBus.execute(new GetUserLinkedAccountsQuery({ userId }));

        return result;
    }
}