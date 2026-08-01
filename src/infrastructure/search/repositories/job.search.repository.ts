import { Injectable } from '@nestjs/common';
import { IndexDocument } from '../../../domain/contracts/search/index-document.model';
import {
  ISearchRepository,
  SearchRepositoryCapabilities,
  SearchRepositoryQuery,
} from '../../../domain/contracts/search/search-repository.interface';

/**
 * Job repository. Currently a stub: no job ingestion exists yet, so it
 * returns an empty list. The pipeline and contract keep the job entity
 * type wired so a real implementation can drop in without a contract
 * change.
 */
@Injectable()
export class JobSearchRepository implements ISearchRepository {
  readonly name = 'job';
  readonly capabilities: SearchRepositoryCapabilities = {
    supports: [],
  };

  async search(_query: SearchRepositoryQuery): Promise<IndexDocument[]> {
    return [];
  }
}
