export function serializeEmojis(
  emojis: Record<string, string>,
): Record<string, unknown>[] {
  return Object.entries(emojis).map(([name, href]) =>
    serializeEmoji(name, href),
  );
}

export function serializeEmoji(
  name: string,
  href: string,
): Record<string, unknown> {
  return {
    shortcode: name.replace(/(^:)|(:$)/g, ""),
    url: href,
    static_url: href,
    visible_in_picker: false,
    category: null,
  };
}
