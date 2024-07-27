import type { Poll, PollOption, PollVote } from "../schema";

export function serializePoll(
  poll: Poll & {
    options: PollOption[];
    votes: PollVote[];
  },
  currentAccountOwner: { id: string },
  // biome-ignore lint/suspicious/noExplicitAny: JSON
): Record<string, any> {
  return {
    id: poll.id,
    expires_at: poll.expires.toISOString(),
    expired: poll.expires <= new Date(),
    multiple: poll.multiple,
    votes_count: poll.options.reduce(
      (acc, option) => acc + option.votesCount,
      0,
    ),
    voters_count: poll.multiple ? poll.votersCount : null,
    voted: poll.votes.some((v) => v.accountId === currentAccountOwner.id),
    own_votes: poll.votes
      .filter((v) => v.accountId === currentAccountOwner.id)
      .map((v) => v.optionIndex),
    options: poll.options
      .toSorted((a, b) => (a.index < b.index ? -1 : 1))
      .map(serializePollOption),
    emojis: [], // TODO
  };
}

// biome-ignore lint/suspicious/noExplicitAny: JSON
export function serializePollOption(option: PollOption): Record<string, any> {
  return {
    title: option.title,
    votes_count: option.votesCount,
  };
}
