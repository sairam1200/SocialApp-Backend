/**
 * The recommendation kernel: pure functions, no Nest, no database, no clock.
 *
 * Everything the feed's behaviour depends on lives here so it can be unit
 * tested with numbers instead of fixtures. The Nest layer in
 * `infrastructure/services/recommendation/` supplies the data; this decides
 * what to do with it.
 *
 * Read `docs/social/RECOMMENDER.md` for the design and its sources.
 */

export * from './ranking-math';
export * from './fusion';
export * from './ranking-weights';
export * from './scorer';
export * from './visibility';
export * from './visibility-scope';
export * from './text';
