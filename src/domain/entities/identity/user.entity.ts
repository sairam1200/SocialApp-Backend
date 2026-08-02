import {
  UserType,
  ProfilePrivacy,
  OnboardingStep,
  TwoFactorMethod,
} from '../../enums';
import { BaseEntity } from '../../baseEntity';
import { Playlist } from '../collection/playlist.entity';
import { Entity, Column, OneToMany, OneToOne } from 'typeorm';
import { PlaylistMember } from '../collection/playlistMember.entity';
import { UserBiometric } from './userBiometric.entity';
import { UserFollow } from '../userFollow.entity';
import { UserTopic } from '../userTopic.entity';
import { LinkedAccount } from '../linkedAccount.entity';

@Entity({ name: 'users', schema: 'identity' })
export class User extends BaseEntity {
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive?: boolean;

  @Column({ type: 'timestamp', nullable: true })
  registeredOn: Date;

  @Column({ nullable: true })
  userName?: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  gender?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ nullable: true })
  googleId?: string;

  @Column({ nullable: true })
  newEmail?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastEmailModifiedAt?: Date;

  @Column({ nullable: true })
  newPhoneNumber?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastPhoneNumberModifiedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUserNameModifiedAt?: Date;

  @Column({ nullable: true })
  normalizedEmail?: string;

  @Column({ nullable: true })
  normalizedUserName?: string;

  @Column({ default: false })
  emailConfirmed: boolean;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true })
  twoFactorSecret?: string;

  /**
   * How the second factor is delivered.
   *
   * `totp` is the existing authenticator-app flow; `email` sends a one-time
   * code. Stored as a plain varchar rather than a Postgres enum so adding a
   * third method later is a code change, not a migration with a lock.
   */
  @Column({ type: 'varchar', length: 16, default: TwoFactorMethod.Totp })
  twoFactorMethod: TwoFactorMethod;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ type: 'timestamp', nullable: true })
  lastPasswordModifiedAt?: Date;

  @Column({ default: false })
  isLockedOut?: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lockoutEnd?: Date;

  @Column({ default: 0 })
  accessFailedCount: number;

  @Column({ nullable: true })
  concurrencyStamp?: string;

  @Column({ nullable: true })
  securityStamp?: string;

  @Column({ nullable: true, unique: true })
  referralCode?: string;

  @Column({ nullable: true })
  referredBy?: string;

  @Column({
    type: 'enum',
    enum: ProfilePrivacy,
    default: ProfilePrivacy.Public,
  })
  profilePrivacy: ProfilePrivacy;

  @Column({
    type: 'enum',
    enum: UserType,
    default: UserType.User,
  })
  type: UserType;

  @Column({
    type: 'enum',
    enum: OnboardingStep,
    default: OnboardingStep.NotStarted,
    nullable: true,
  })
  onboardingStep?: OnboardingStep;

  @OneToOne(() => UserBiometric, (biometrics) => biometrics.user, {
    cascade: true,
    eager: false,
  })
  biometrics?: UserBiometric;

  @OneToMany(() => Playlist, (playlist) => playlist.owner)
  ownedPlaylists: Playlist[];

  @OneToMany(() => PlaylistMember, (entry) => entry.user)
  playlistMemberships: PlaylistMember[];

  @OneToMany(() => UserFollow, (follow) => follow.followed)
  followers: UserFollow[];

  @OneToMany(() => UserFollow, (follow) => follow.follower)
  following: UserFollow[];

  @OneToMany(() => UserTopic, (userTopic) => userTopic.user)
  userTopics: UserTopic[];

  @OneToMany(() => LinkedAccount, (la) => la.user)
  linkedAccounts: LinkedAccount[];

  constructor(request: Partial<User> = {}) {
    super();
    Object.assign(this, request);
    this.normalizedEmail = request.email?.toUpperCase();
    this.normalizedUserName = request.userName?.toUpperCase();
    this.registeredOn = new Date();
  }
}
