import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { IPlaylistRepository } from '../../../../domain/repositories/iplaylist.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { PlaylistContentModel } from '../../../../domain/contracts/playlist.model';
import { ContentStream } from '../../../../domain/entities/contentStream.entity';
import { mapToPlaylistContentModel } from '../../../../domain/mappers/playlist.mpper';

export class ListBookmarksQuery {
  model: {
    userNameOrId: string;
    page: number;
    limit: number;
  };

  constructor(request: Partial<ListBookmarksQuery> = {}) {
    Object.assign(this, request);
  }
}

const listBookmarksValidations = Joi.object({
  userNameOrId: Joi.string().required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

@CommandHandler(ListBookmarksQuery)
export class ListBookmarksQueryHandler implements ICommandHandler<
  ListBookmarksQuery,
  {
    items: PlaylistContentModel[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(query: ListBookmarksQuery): Promise<{
    items: PlaylistContentModel[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { model } = query;
    await listBookmarksValidations.validateAsync(model);

    const bookmark = await this.playlistRepository.getByNameAsync(
      model.userNameOrId,
      _const.COLLECTION.BOOKMARK.NAME,
    );

    if (!bookmark) {
      return {
        items: [],
        total: 0,
        page: model.page,
        limit: model.limit,
        totalPages: 0,
      };
    }

    const { items, total } =
      await this.playlistRepository.getContentsPaginatedAsync(
        bookmark.referenceId,
        model.page,
        model.limit,
      );

    const externalIds = (items ?? [])
      .map((c) => c.contentId)
      .filter((id) => id != null);

    const streamByAnyId = new Map<string, ContentStream>();
    if (externalIds.length > 0) {
      const contentStreams =
        await this.contentStreamRepository.getByIdsOrExternalIdsAsync(
          externalIds,
        );
      for (const stream of contentStreams) {
        streamByAnyId.set(stream.id, stream);
        streamByAnyId.set(stream.externalId, stream);
      }

      const unresolvedIds = externalIds.filter((id) => !streamByAnyId.has(id));
      if (unresolvedIds.length > 0) {
        const userContents =
          await this.userContentRepository.getByIdsAsync(unresolvedIds);
        const extIdsFromUC = userContents
          .map((uc) => uc.externalId)
          .filter((eid): eid is string => !!eid);

        if (extIdsFromUC.length > 0) {
          const resolvedStreams =
            await this.contentStreamRepository.getByExternalIdsAsync(
              extIdsFromUC,
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
    }

    const enrichedItems = (items ?? []).map<PlaylistContentModel>((content) => {
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
    });

    return {
      items: enrichedItems,
      total,
      page: model.page,
      limit: model.limit,
      totalPages: Math.ceil(total / model.limit),
    };
  }
}
