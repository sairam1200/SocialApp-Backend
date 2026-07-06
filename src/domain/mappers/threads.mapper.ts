import {
  ThreadsContentModel,
  ThreadsProfileModel,
} from '../contracts/threads.model';
import { LinkedAccount } from '../entities/linkedAccount.entity';
import { UserContent } from '../entities/userContent.entity';

export function mapToThreadsProfileModel(
  data: LinkedAccount,
  includeSensitiveFields: boolean = false,
): ThreadsProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount || 0,
    followingCount: data.followingCount || 0,
    userName: data.userName,
    threadsId: data.externalId,
    displayName: data.metaData?.displayName || data.userName,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
  } as ThreadsProfileModel;
}

export function mapToThreadsContentModel(
  data: UserContent,
): ThreadsContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    externalId: data.externalId,
    description: data.metaData?.description,
    imageUrl: data.metaData?.imageUrl,
    videoUrl: data.metaData?.videoUrl,
    link: data.metaData?.link,
    createdAt: data.metaData?.createdAt,
  } as ThreadsContentModel;
}
