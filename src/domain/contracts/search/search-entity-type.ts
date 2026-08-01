/**
 * Searchable entity type shared across the search pipeline and the wire
 * contract. Never compare raw strings to this enum; always reference the
 * members so a typo becomes a compile error.
 */
export enum SearchEntityType {
  CONTENT = 'content',
  PROFILE = 'profile',
  PROJECT = 'project',
  JOB = 'job',
}
