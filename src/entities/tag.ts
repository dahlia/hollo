export function serializeTag(
  tag: string,
  currentAccountOwner: { followedTags: string[] },
  baseUrl: URL | string,
) {
  return {
    name: tag,
    url: new URL(`/tags/${encodeURIComponent(tag)}`, baseUrl).href,
    history: [],
    following: currentAccountOwner.followedTags.includes(tag),
  };
}
