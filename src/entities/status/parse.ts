import type { components } from "../../api/schema";

type Status = components["schemas"]["Status"];
type Attachment = components["schemas"]["Attachment"];
type Poll = components["schemas"]["Poll"];

// The instance spec lags real responses (PLAN pitfalls, measured 2026-07-13):
// reaction `url`, `Attachment.blurhash`/`meta`, and poll `own_votes` are
// absent from the generated types but present on the wire. Per
// parse-don't-validate they are recovered here, once, with `in` narrowing —
// components trust the parsed shapes and never re-check.

export type EmojiReaction = {
  name: string;
  count: number;
  me: boolean;
  /** Image URL for custom emoji; null for Unicode emoji. */
  url: string | null;
};

export const parseEmojiReactions = (status: Status): EmojiReaction[] => {
  const reactions: EmojiReaction[] = [];
  for (const reaction of status.pleroma?.emoji_reactions ?? []) {
    if (reaction.name === undefined || reaction.name === "") continue;
    reactions.push({
      name: reaction.name,
      count: reaction.count ?? 0,
      me: reaction.me ?? false,
      url:
        "url" in reaction && typeof reaction.url === "string"
          ? reaction.url
          : null,
    });
  }
  return reactions;
};

export type AttachmentExtras = {
  blurhash: string | null;
  /** width / height of the original; null when meta is missing (remote). */
  aspectRatio: number | null;
};

export const parseAttachmentExtras = (
  attachment: Attachment,
): AttachmentExtras => ({
  blurhash:
    "blurhash" in attachment && typeof attachment.blurhash === "string"
      ? attachment.blurhash
      : null,
  aspectRatio: aspectRatioOf(attachment),
});

const aspectRatioOf = (attachment: Attachment): number | null => {
  if (!("meta" in attachment)) return null;
  const meta = attachment.meta;
  if (typeof meta !== "object" || meta === null) return null;
  if (!("original" in meta)) return null;
  const original = meta.original;
  if (typeof original !== "object" || original === null) return null;
  const width =
    "width" in original && typeof original.width === "number"
      ? original.width
      : null;
  const height =
    "height" in original && typeof original.height === "number"
      ? original.height
      : null;
  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
};

export type ParsedPoll = {
  options: { title: string; votesCount: number; ratio: number }[];
  votesCount: number;
  /** Null for single-choice polls (spec) — fall back to votesCount. */
  votersCount: number | null;
  multiple: boolean;
  expired: boolean;
  expiresAt: string | null;
  /** Spec says null when unauthenticated; in reality the key is absent. Both mean false. */
  voted: boolean;
  ownVotes: ReadonlySet<number>;
  anonymous: boolean | null;
};

export const parsePoll = (poll: Poll): ParsedPoll => {
  const votesCount = poll.votes_count ?? 0;
  const votersCount = poll.voters_count ?? null;
  const multiple = poll.multiple ?? false;
  // Multi-choice ratios are per voter (one account can pick several options);
  // single-choice ratios are per vote.
  const denominator = multiple ? (votersCount ?? votesCount) : votesCount;
  return {
    options: (poll.options ?? []).map((option) => {
      const optionVotes = option.votes_count ?? 0;
      return {
        title: option.title ?? "",
        votesCount: optionVotes,
        ratio: denominator > 0 ? optionVotes / denominator : 0,
      };
    }),
    votesCount,
    votersCount,
    multiple,
    expired: poll.expired ?? false,
    expiresAt: poll.expires_at ?? null,
    voted: poll.voted ?? false,
    ownVotes: new Set(ownVotesOf(poll)),
    anonymous: poll.akkoma?.anonymous ?? null,
  };
};

const ownVotesOf = (poll: Poll): number[] => {
  if (!("own_votes" in poll)) return [];
  const ownVotes = poll.own_votes;
  if (!Array.isArray(ownVotes)) return [];
  return ownVotes.filter((v) => typeof v === "number");
};
