import { ApiProperty } from '@nestjs/swagger';

export class PagedResult<T> {
  @ApiProperty()
  result: T;

  @ApiProperty({ default: 0 })
  total: number;

  constructor(result: T, total: number) {
    this.result = result;
    this.total = total;
  }
}
