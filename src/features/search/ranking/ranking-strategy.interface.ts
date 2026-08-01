import { SearchEntityType } from '../../../domain/contracts/search/search-entity-type';
import { SearchCandidate } from '../../../domain/contracts/search/search-candidate.model';
import { SearchRepositoryQuery } from '../../../domain/contracts/search/search-repository.interface';

export interface RankingContext {
  query: SearchRepositoryQuery;
  now: Date;
}

export interface IRankingStrategy {
  readonly type: SearchEntityType;
  rank(candidate: SearchCandidate, context: RankingContext): number;
}
