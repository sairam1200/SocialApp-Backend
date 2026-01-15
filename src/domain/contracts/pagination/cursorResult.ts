import { ApiProperty } from "@nestjs/swagger";

export class CursorResult<T> {
  @ApiProperty({ type: Array, description: 'Array of items' })
  contents: T[];

  @ApiProperty({ type: String, nullable: true, description: 'Cursor for the next page. Null if no more pages' })
  nextCursor: string | null;

  @ApiProperty({ type: Boolean, description: 'Whether there are more items to fetch' })
  hasMore: boolean;

  constructor(contents: T[], nextCursor: string | null, hasMore: boolean) {
    this.contents = contents;
    this.nextCursor = nextCursor;
    this.hasMore = hasMore;
  }
}

