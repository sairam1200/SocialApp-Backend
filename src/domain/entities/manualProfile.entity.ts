import { BaseEntity } from "../baseEntity";
import { Column, Entity } from "typeorm";

@Entity({ name: 'manualProfiles' })
export class ManualProfile extends BaseEntity {

  @Column()
  userId: string;

  @Column()
  platform: string;

  @Column()
  isActive: boolean;

  @Column()
  icon: string;

  @Column()
  url: string;

  @Column({ default: 0 })
  displayOrder: number;

  constructor(request: Partial<ManualProfile> = {}) {
    super();
    Object.assign(this, request);
  }
}