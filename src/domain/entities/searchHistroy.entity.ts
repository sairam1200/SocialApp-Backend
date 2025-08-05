import { Column, Entity } from "typeorm";
import { BaseEntity } from "../baseEntity";

@Entity({ name: "searchHistories" })
export class SearchHistory extends BaseEntity {

  @Column()
  originalQuery: string;

  @Column()
  normalizedQuery: string;

  @Column()
  userId?: string;
}