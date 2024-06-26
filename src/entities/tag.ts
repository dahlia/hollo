import type { FeaturedTag } from "../schema";

export function serializeTag(
  tag: string,
  currentAccountOwner: { followedTags?: string[] } | null | undefined,
  baseUrl: URL | string,
) {
  return {
    name: tag,
    url: new URL(`/tags/${encodeURIComponent(tag)}`, baseUrl).href,
    history: [],
    following: currentAccountOwner?.followedTags?.includes(tag) ?? false,
  };
}

export function serializeFeaturedTag(
  featuredTag: FeaturedTag,
  stats: { posts: number; lastPublished: Date | null } | undefined,
  baseUrl: URL | string,
) {
  return {
    id: featuredTag.id,
    name: featuredTag.name,
    url: new URL(`/tags/${encodeURIComponent(featuredTag.name)}`, baseUrl).href,
    statuses_count: stats?.posts ?? 0,
    last_status_at: stats?.lastPublished?.toISOString() ?? null,
  };
}
