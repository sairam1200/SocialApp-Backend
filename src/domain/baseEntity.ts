import {
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    BeforeInsert,
    BeforeUpdate,
    BaseEntity as TypeORMBaseEntity
} from 'typeorm';

export abstract class BaseEntity extends TypeORMBaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

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

    // Not persisted: used to pass user context
    private _currentUser?: string;

    constructor() {
        super();
        this.lastRefreshed = new Date();
    }

    setCurrentUser(user: string) {
        this._currentUser = user;
    }

    @BeforeInsert()
    private beforeInsert() {
        this.createdBy = this._currentUser;
        this.lastModifiedBy = this._currentUser;
    }

    @BeforeUpdate()
    private beforeUpdate() {
        this.lastModifiedBy = this._currentUser;
        this.lastModifiedOn = new Date();
    }
}