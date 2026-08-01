import { Injectable } from '@nestjs/common';
import { SearchEntityType } from '../../../domain/contracts/search/search-entity-type';
import { IRankingStrategy } from './ranking-strategy.interface';

/**
 * Owns the dispatch table between entity type and ranking strategy. The
 * engine must never hardcode a switch on entity type; it always goes
 * through the registry, which is populated at wiring time.
 */
@Injectable()
export class RankingStrategyRegistry {
  private readonly strategies = new Map<SearchEntityType, IRankingStrategy>();

  register(strategy: IRankingStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  registerAll(strategies: IRankingStrategy[]): void {
    for (const strategy of strategies) {
      this.register(strategy);
    }
  }

  get(type: SearchEntityType): IRankingStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(
        `No ranking strategy registered for entity type "${type}"`,
      );
    }
    return strategy;
  }
}
