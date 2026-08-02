import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiProperty, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ManualProfileSearchResponseModel } from '../../../../domain/contracts/manualProfile.model';

export class ManualProfileSearchPagedResult {
  @ApiProperty({ type: [ManualProfileSearchResponseModel] })
  result: ManualProfileSearchResponseModel[];

  @ApiProperty({ default: 0 })
  total: number;
}

@ApiTags('User Profiles')
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class SearchManualProfileController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get('manual-profile/search')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: ManualProfileSearchPagedResult,
  })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'order', required: false, type: String, example: 'ASC' })
  @ApiQuery({ name: 'orderBy', required: false, type: String, example: 'id' })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  public async Search(
    @Res() res: Response,
    @Query('pageSize') pageSize: number = 10,
    @Query('page') page: number = 1,
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('orderBy') orderBy: string = 'id',
    @Query('searchTerm') searchTerm?: string,
  ): Promise<Response> {
    const allowedOrderColumns = ['id', 'firstname', 'lastname', 'email', 'createdOn'];
    if (!allowedOrderColumns.includes(orderBy)) {
      orderBy = 'id';
    }
    return res;
  }
}
