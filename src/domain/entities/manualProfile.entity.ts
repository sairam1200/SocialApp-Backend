import { User } from "../entities";
import { BaseEntity } from "../baseEntity";
import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";

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

  @ManyToOne(() => User, { eager: false, nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  constructor(request: Partial<ManualProfile> = {}) {
    super();
    Object.assign(this, request);
  }
}