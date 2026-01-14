import { Entity, Column, OneToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "../../baseEntity";
import { User } from "./user.entity";
import { ProfileImagePrivacy, ProfilePrivacy } from "../../enums";

@Entity({ name: 'userBiometrics', schema: 'identity' })
export class UserBiometric extends BaseEntity {
  @OneToOne(() => User, user => user.biometrics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  userId: string;

  @Column({ nullable: true })
  profileImageUrl?: string;

  @Column()
  defaultProfileImageUrl: string;

  @Column({
    type: 'enum',
    enum: ProfileImagePrivacy,
    default: ProfileImagePrivacy.Everyone,
  })
  privacy: ProfileImagePrivacy;

  @Column({
    type: 'enum',
    enum: ProfilePrivacy,
    default: ProfilePrivacy.Public,
  })
  profilePrivacy: ProfilePrivacy;

  constructor(request: Partial<UserBiometric> = {}) {
    super();
    Object.assign(this, request);
  }
}
