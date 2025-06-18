import { Entity, Column } from "typeorm";
import { BaseEntity } from "../baseEntity";
import { UserType } from "../enums";

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
    normalizedEmail?: string;

    @Column({ default: false })
    emailConfirmed: boolean;

    @Column({ nullable: true })
    passwordHash: string;

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

    @Column({ nullable: true })
    profileImage?: string;

    constructor(request: Partial<User> = {}) {
        super();
        Object.assign(this, request);
        this.normalizedEmail = request.email?.toUpperCase();
        this.registeredOn = new Date();
    }
}
