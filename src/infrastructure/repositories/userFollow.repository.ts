import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { FollowStatus } from '../../domain/enums';
import { UserFollow } from '../../domain/entities/userFollow.entity';
import {
  IUserFollowRepository,
  PaginatedResult,
} from '../../domain/repositories/iuserFollow.repository';
import { User } from '../../domain/entities';

@Injectable()
export class UserFollowRepository implements IUserFollowRepository {
  constructor(
    @InjectRepository(UserFollow)
    private readonly followContext: Repository<UserFollow>,
    @InjectRepository(User) private readonly userContext: Repository<User>,
  ) {}

  public async getAsync(
    followerId: string,
    followedId: string,
  ): Promise<UserFollow | null> {
    return this.followContext.findOne({
      where: { followerId, followedId },
    });
  }

  public async createAsync(follow: UserFollow): Promise<UserFollow> {
    return this.followContext.save(follow);
  }

  public async deleteAsync(follow: UserFollow): Promise<void> {
    await this.followContext.delete(follow.id);
  }

  public async updateStatusAsync(
    followId: string,
    status: FollowStatus,
  ): Promise<boolean> {
    const result = await this.followContext.update(followId, { status });
    return result.affected > 0;
  }

  public async getWithUsersAsync(
    followerId: string,
    followedId: string,
  ): Promise<UserFollow | null> {
    const qb = this.buildFollowQuery('follow');
    qb.where('follow.followerId = :followerId', { followerId }).andWhere(
      'follow.followedId = :followedId',
      { followedId },
    );
    return qb.getOne();
  }

  public async getFollowersAsync(
    userId: string,
    status: FollowStatus | null,
  ): Promise<UserFollow[]> {
    const qb = this.buildFollowQuery('follow');
    qb.where('follow.followedId = :userId', { userId });
    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }
    qb.orderBy('follow.createdOn', 'DESC');
    return qb.getMany();
  }

  public async getFollowingAsync(
    userId: string,
    status: FollowStatus | null,
  ): Promise<UserFollow[]> {
    const qb = this.buildFollowQuery('follow');
    qb.where('follow.followerId = :userId', { userId });
    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }
    qb.orderBy('follow.createdOn', 'DESC');
    return qb.getMany();
  }

  public async getFollowersPaginatedAsync(
    userId: string,
    page: number,
    limit: number,
    status?: FollowStatus | null,
  ): Promise<PaginatedResult<UserFollow>> {
    const skip = (page - 1) * limit;
    const qb = this.buildFollowQuery('follow');
    qb.where('follow.followedId = :userId', { userId });
    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }
    qb.orderBy('follow.createdOn', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, hasMore: skip + items.length < total };
  }

  public async getFollowingPaginatedAsync(
    userId: string,
    page: number,
    limit: number,
    status?: FollowStatus | null,
  ): Promise<PaginatedResult<UserFollow>> {
    const skip = (page - 1) * limit;
    const qb = this.buildFollowQuery('follow');
    qb.where('follow.followerId = :userId', { userId });
    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }
    qb.orderBy('follow.createdOn', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, hasMore: skip + items.length < total };
  }

  public async countFollowersAsync(
    userId: string,
    status?: FollowStatus,
  ): Promise<number> {
    const qb = this.followContext
      .createQueryBuilder('follow')
      .where('follow.followedId = :userId', { userId });

    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }

    return qb.getCount();
  }

  public async countFollowingAsync(
    userId: string,
    status?: FollowStatus,
  ): Promise<number> {
    const qb = this.followContext
      .createQueryBuilder('follow')
      .where('follow.followerId = :userId', { userId });

    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }

    return qb.getCount();
  }

  public async getCommonFollowersAsync(
    userAId: string,
    userBId: string,
    status?: FollowStatus,
  ): Promise<UserFollow[]> {
    const qb = this.followContext
      .createQueryBuilder('follow')
      .leftJoinAndSelect('follow.follower', 'follower')
      .where('follow.followedId IN (:...userIds)', {
        userIds: [userAId, userBId],
      });

    if (status) {
      qb.andWhere('follow.status = :status', { status });
    }

    // find followers who follow both users
    qb.select(['follow.followerId as followerId', 'COUNT(*) as followCount'])
      .groupBy('follow.followerId')
      .having('COUNT(*) = 2');

    const rows = await qb.getRawMany<{ followerId: string }>();
    if (!rows.length) return [];

    const followerIds = rows.map((r) => r.followerId);
    return this.buildFollowQuery('follow')
      .where('follow.followedId = :userAId', { userAId })
      .andWhere('follow.followerId IN (:...followerIds)', { followerIds })
      .getMany();
  }

  private buildFollowQuery(alias: string): SelectQueryBuilder<UserFollow> {
    return this.followContext
      .createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.follower`, 'follower')
      .leftJoinAndSelect(`${alias}.followed`, 'followed')
      .leftJoinAndSelect('follower.biometrics', 'followerBiometrics')
      .leftJoinAndSelect('followed.biometrics', 'followedBiometrics')
      .select([
        `${alias}.id`,
        `${alias}.status`,
        `${alias}.createdOn`,
        `${alias}.followerId`,
        `${alias}.followedId`,
        'follower.id',
        'follower.userName',
        'follower.firstName',
        'follower.lastName',
        'followerBiometrics.profileImageUrl',
        'followed.id',
        'followed.userName',
        'followed.firstName',
        'followed.lastName',
        'followedBiometrics.profileImageUrl',
      ]);
  }
}
