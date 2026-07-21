import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiTags, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { SearchProjectsQuery } from './search-projects.handler';

@ApiTags('Projects')
@Controller({ path: '/projects', version: '1' })
export class ProjectSearchController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('search')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'projectType', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  public async searchProjects(
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('projectType') projectType?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<Response> {
    const result = await this.commandBus.execute(
      new SearchProjectsQuery({ q, status, projectType, page, limit }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
