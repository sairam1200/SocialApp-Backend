import { ApiProperty } from '@nestjs/swagger';

export type GithubUserDataType = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  twitter_username: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
};

export class GithubProfileModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  login: string;

  @ApiProperty({ required: false })
  name: string | null;

  @ApiProperty()
  avatarUrl: string;

  @ApiProperty()
  profileUrl: string;

  @ApiProperty({ required: false })
  bio: string | null;

  @ApiProperty({ required: false })
  company: string | null;

  @ApiProperty({ required: false })
  blog: string | null;

  @ApiProperty({ required: false })
  location: string | null;

  @ApiProperty({ required: false })
  email: string | null;

  @ApiProperty({ required: false })
  hireable: boolean | null;

  @ApiProperty({ required: false })
  twitterUsername: string | null;

  @ApiProperty()
  publicRepos: number;

  @ApiProperty()
  publicGists: number;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  allowImport: boolean;
}

/* ==========================================================================
 * Search
 *
 * GitHub is the second platform with a working connection, and the only one besides
 * YouTube needing no credential at all: api.github.com/search/* serves unauthenticated
 * requests at 10/minute (60/hour with a token). That makes it the cheapest real
 * integration available.
 *
 * The models above are for OAuth account linking — GitHub was wired for linking long
 * before it was searchable.
 * ========================================================================== */

/** Raw shape of a repository in a GitHub search response, narrowed to what is used. */
export type GithubRepoSearchItemType = {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string | null;
  owner?: { login?: string; avatar_url?: string | null } | null;
};

/** Raw shape of a user in a GitHub search response. */
export type GithubUserSearchItemType = {
  id: number;
  login: string;
  html_url: string;
  avatar_url: string | null;
  type: string;
};

export class GithubSearchResponseModel {
  @ApiProperty()
  query: string;

  @ApiProperty({ type: Object })
  results: {
    repositories: GithubRepoSearchItemType[];
    users: GithubUserSearchItemType[];
  };

  /**
   * GitHub paginates by page number rather than cursor, so this is the next page index —
   * `null` when the current page is the last one available.
   */
  @ApiProperty({ required: false, nullable: true })
  nextPage?: number | null;

  constructor(partial?: Partial<GithubSearchResponseModel>) {
    this.query = '';
    this.results = { repositories: [], users: [] };
    this.nextPage = null;
    Object.assign(this, partial);
  }
}
