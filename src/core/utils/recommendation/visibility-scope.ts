/**
 * The viewer's audience memberships, resolved once per request.
 *
 * A flat list of visibility levels is not enough to filter a feed correctly.
 * Being someone's close friend must not reveal *everyone else's* close-friends
 * posts — but `visibility IN ('public','close_friends')` does exactly that.
 * The predicate has to pair each level with the authors that granted it, which
 * is what this carries.
 */
export interface VisibilityScope {
  viewerProfileId: string | null;
  /** Authors the viewer follows, with an accepted follow. */
  followingProfileIds: string[];
  /** Authors who put the viewer in their close-friends audience. */
  closeFriendOfProfileIds: string[];
  /** Authors who put the viewer in their brand-partners audience. */
  brandPartnerOfProfileIds: string[];
  /** Blocked in either direction, plus muted. Excluded from every read. */
  excludedProfileIds: string[];
}

export const PUBLIC_SCOPE: Readonly<VisibilityScope> = Object.freeze({
  viewerProfileId: null,
  followingProfileIds: [],
  closeFriendOfProfileIds: [],
  brandPartnerOfProfileIds: [],
  excludedProfileIds: [],
});

/**
 * The SQL predicate for "this viewer may see this post", plus its parameters.
 *
 * Returned as a fragment rather than applied directly so every query — feed,
 * thread, search, profile timeline — uses the same one. There is exactly one
 * definition of who can see what, and this is it.
 *
 * `alias` is the table alias in the caller's query. `suffix` disambiguates the
 * parameter names when a query needs the predicate more than once.
 */
export function visibilityPredicate(
  alias: string,
  scope: VisibilityScope,
  suffix = '',
): { sql: string; parameters: Record<string, unknown> } {
  const clauses: string[] = [`${alias}."visibility" = 'public'`];
  const parameters: Record<string, unknown> = {};

  if (scope.viewerProfileId) {
    const key = `viewerProfileId${suffix}`;
    clauses.push(`${alias}."authorProfileId" = :${key}`);
    parameters[key] = scope.viewerProfileId;
  }

  if (scope.followingProfileIds.length > 0) {
    const key = `followingIds${suffix}`;
    clauses.push(
      `(${alias}."visibility" = 'followers' AND ${alias}."authorProfileId" IN (:...${key}))`,
    );
    parameters[key] = scope.followingProfileIds;
  }

  if (scope.closeFriendOfProfileIds.length > 0) {
    const key = `closeFriendIds${suffix}`;
    clauses.push(
      `(${alias}."visibility" IN ('followers','close_friends') AND ${alias}."authorProfileId" IN (:...${key}))`,
    );
    parameters[key] = scope.closeFriendOfProfileIds;
  }

  if (scope.brandPartnerOfProfileIds.length > 0) {
    const key = `brandPartnerIds${suffix}`;
    clauses.push(
      `(${alias}."visibility" IN ('followers','brand_partners') AND ${alias}."authorProfileId" IN (:...${key}))`,
    );
    parameters[key] = scope.brandPartnerOfProfileIds;
  }

  return { sql: `(${clauses.join(' OR ')})`, parameters };
}
