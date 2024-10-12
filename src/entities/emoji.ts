import type { Account, Reaction } from "../schema";

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

export function serializeReaction(
  reaction: Reaction & { account: Account },
  currentAccountOwner: { id: string },
): Record<string, unknown> {
  const [result] = serializeReactions([reaction], currentAccountOwner);
  return result;
}

export function serializeReactions(
  reactions: (Reaction & { account: Account })[],
  currentAccountOwner: { id: string },
): Record<string, unknown>[] {
  const result: Record<
    string,
    { count: number; account_ids: string[]; me: boolean } & Record<
      string,
      unknown
    >
  > = {};
  for (const reaction of reactions) {
    const domain =
      reaction.customEmoji == null
        ? null
        : reaction.account.handle.replace(/^@?[^@]+@/, "");
    const key =
      reaction.customEmoji == null
        ? reaction.emoji
        : `${reaction.emoji}\n${domain}`;
    const me = reaction.account.id === currentAccountOwner.id;
    if (key in result) {
      result[key].count++;
      result[key].me ||= me;
      result[key].account_ids.push(reaction.account.id);
    } else {
      result[key] =
        reaction.customEmoji == null
          ? {
              name: reaction.emoji,
              me,
              count: 1,
              account_ids: [reaction.account.id],
            }
          : {
              name: reaction.emoji.replace(/(^:)|(:$)/g, ""),
              domain,
              url: reaction.customEmoji,
              static_url: reaction.customEmoji,
              me,
              count: 1,
              account_ids: [reaction.account.id],
            };
    }
  }
  return Object.values(result);
}
