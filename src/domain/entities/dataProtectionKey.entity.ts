import { Column, Entity } from "typeorm";
import { BaseEntity } from "../baseEntity";

@Entity({ name: 'dataProtectionKeys' })
export class DataProtectionKey extends BaseEntity {

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: false })
  key: string;

  @Column({ nullable: true })
  value?: string;

  @Column({ nullable: true })
  expiresIn?: number;

  constructor(partial?: Partial<DataProtectionKey>) {
    super();
    Object.assign(this, partial);
  }
}