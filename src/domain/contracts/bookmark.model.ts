import { ApiProperty } from '@nestjs/swagger';

export class BookmarkCheckModel {
  @ApiProperty()
  bookmarked: boolean;
}

export class BookmarkCheckBatchModel {
  @ApiProperty({ type: [String] })
  bookmarkedIds: string[];
}

export class BookmarkCountResponseModel {
  @ApiProperty()
  count: number;
}

export class BookmarkListResponseModel {
  @ApiProperty({ type: [Object] })
  items: any[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
