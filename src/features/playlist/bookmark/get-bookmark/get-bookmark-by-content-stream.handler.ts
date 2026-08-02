import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import {
  PlaylistModel,
  PlaylistContentModel,
} from '../../../../domain/contracts/playlist.model';
import { ContentStream } from '../../../../domain/entities/contentStream.entity';
import { PlaylistNotFoundException } from '../../../../core/exceptions/playlist.exception';
import { IPlaylistRepository } from '../../../../domain/repositories/iplaylist.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import {
  mapToPlaylistModel,
  mapToPlaylistContentModel,
} from '../../../../domain/mappers/playlist.mpper';
import * as Joi from 'joi';

export class GetBookmarkContentsQuery {
  model: {
    userNameOrId: string;
    playlistName: string;
  };

  constructor(request: Partial<GetBookmarkContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

const getBookmarkContentsValidation = Joi.object({
  userNameOrId: Joi.string().required(),
  playlistName: Joi.string().required(),
});

@CommandHandler(GetBookmarkContentsQuery)
export class GetBookmarkContentsQueryHandler implements ICommandHandler<
  GetBookmarkContentsQuery,
  PlaylistModel
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: GetBookmarkContentsQuery,
  ): Promise<PlaylistModel> {
    const { model } = query;
    await getBookmarkContentsValidation.validateAsync(query.model);

    const playlist = await this.playlistRepository.getByNameAsync(
      model.userNameOrId,
      model.playlistName,
    );

    if (!playlist) {
      throw new PlaylistNotFoundException();
    }

    const baseModel = mapToPlaylistModel(playlist);

    const contents = await this.playlistRepository.getContentsAsync(
      playlist.referenceId,
    );

    const externalIds = (contents ?? [])
      .map((c) => c.contentId)
      .filter((id) => id != null);

    if (externalIds.length === 0) {
      return baseModel;
    }

    const contentStreams =
      await this.contentStreamRepository.getByIdsOrExternalIdsAsync(
        externalIds,
      );

    const streamByAnyId = new Map<string, ContentStream>();
    for (const stream of contentStreams) {
      streamByAnyId.set(stream.id, stream);
      streamByAnyId.set(stream.externalId, stream);
    }

    const unresolvedIds = externalIds.filter((id) => !streamByAnyId.has(id));

    if (unresolvedIds.length > 0) {
      const userContents =
        await this.userContentRepository.getByIdsAsync(unresolvedIds);
      const externalIdsFromUC = userContents
        .map((uc) => uc.externalId)
        .filter((eid): eid is string => !!eid);

      if (externalIdsFromUC.length > 0) {
        const resolvedStreams =
          await this.contentStreamRepository.getByExternalIdsAsync(
            externalIdsFromUC,
          );
        for (const stream of resolvedStreams) {
          streamByAnyId.set(stream.externalId, stream);
          for (const uc of userContents) {
            if (uc.externalId === stream.externalId) {
              streamByAnyId.set(uc.id, stream);
            }
          }
        }
      }
    }

    const enrichedContents = (contents ?? []).map<PlaylistContentModel>(
      (content) => {
        const base = mapToPlaylistContentModel(content);
        const stream = streamByAnyId.get(content.contentId);

        if (!stream) {
          return base;
        }

        const meta = stream.metaData ?? {};

        return {
          ...base,
          title: stream.title ?? base.title,
          platform: stream.platform ?? base.platform,
          type: stream.type?.toString() ?? base.type,
          description:
            meta.description ?? meta.caption ?? meta.text ?? base.description,
          thumbnailUrl: meta.thumbnailUrl ?? base.thumbnailUrl,
          contentUrl: meta.mediaUrl ?? meta.sourceUrl ?? base.contentUrl,
          metadata: stream.metaData ?? base.metadata,
          addedBy: {
            ...base.addedBy,
            displayName: meta.creatorName ?? base.addedBy.displayName,
            userName: meta.creatorUsername ?? base.addedBy.userName,
          },
        };
      },
    );

    return { ...baseModel, contents: enrichedContents };
  }
}
