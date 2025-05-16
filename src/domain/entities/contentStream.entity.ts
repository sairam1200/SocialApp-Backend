import { BaseEntity } from "../../domain/baseEntity";

export class ContentStream extends BaseEntity {



  constructor(request: Partial<ContentStream> = {}) {
    super();
    Object.assign(this, request);
  }
}