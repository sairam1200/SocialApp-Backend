import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { DeactivateUserCommand } from "./deactivate-user.handler";
import { Controller, HttpStatus, Patch, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Users')
@UseGuards(UserAccoutGuard)
@Controller({
    path: `/user`,
    version: '1',
})
export class DeactivateUserController {

    constructor(private readonly commandBus: CommandBus) { }

    @Patch('deactivate')
    @ApiQuery({ name: 'userId', required: true, type: String })
    @ApiResponse({ status: 204, description: 'NO_CONTENT' })
    @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
    @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
    @ApiResponse({ status: 403, description: 'FORBIDDEN' })
    public async Deactivate(
        @Query('userId') userId: string,
        @Res() res: Response
    ): Promise<void> {
        await this.commandBus.execute(new DeactivateUserCommand({ userId }));
        res.status(HttpStatus.NO_CONTENT).send(null);
    }
}

