import {
  Entity,
  Column,
  PrimaryColumn,
  OneToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { NotificationChannel, Theme } from "../../enums";

@Entity({ name: 'userPreferences', schema: 'identity' })
export class UserPreference {
  @PrimaryColumn('uuid')
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: Theme,
    default: Theme.System,
  })
  theme: Theme;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    array: true,
  })
  notificationChannelsEnabled: NotificationChannel[];

  @Column({ nullable: true })
  createdBy?: string;

  @CreateDateColumn()
  createdOn: Date;

  @Column({ nullable: true })
  lastModifiedBy?: string;

  @UpdateDateColumn({ nullable: true })
  lastModifiedOn?: Date;

  @Column()
  lastRefreshed: Date;

  private _currentUser?: string;

  constructor(request: Partial<UserPreference> = {}) {
    Object.assign(this, request);
    this.lastRefreshed = new Date();
  }

  setCurrentUser(user: string) {
    this._currentUser = user;
  }

  @BeforeInsert()
  private beforeInsert() {
    this.createdBy = this._currentUser;
    this.createdOn = new Date();
  }

  @BeforeUpdate()
  private beforeUpdate() {
    this.lastModifiedBy = this._currentUser;
    this.lastModifiedOn = new Date();
  }
}
