import { UserType } from "../../enums";
import { BaseEntity } from "../../baseEntity";
import { Playlist } from "../collection/playlist.entity";
import { Entity, Column, OneToMany, OneToOne } from "typeorm";
import { PlaylistMember } from "../collection/playlistMember.entity";
import { UserBiometric } from "./userBiometric.entity";

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

    @Column({
        type: 'enum',
        enum: UserType,
        default: UserType.User,
    })
    type: UserType;

    @OneToOne(() => UserBiometric, biometrics => biometrics.user, { cascade: true, eager: false })
    biometrics?: UserBiometric;

    @OneToMany(() => Playlist, playlist => playlist.owner)
    ownedPlaylists: Playlist[];

    @OneToMany(
        () => PlaylistMember,
        entry => entry.user
    )
    playlistMemberships: PlaylistMember[];

    constructor(request: Partial<User> = {}) {
        super();
        Object.assign(this, request);
        this.normalizedEmail = request.email?.toUpperCase();
        this.normalizedUserName = request.userName?.toUpperCase();
        this.registeredOn = new Date();
    }
}