import { BaseEntity } from "../baseEntity";

export class UserContent extends BaseEntity {


  constructor(request: Partial<UserContent> = {}) {
    super();
    Object.assign(this, request);
  }
}