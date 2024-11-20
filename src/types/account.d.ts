// Define an interface for ActorProfile
interface ActorProfile {
  id: string;
  acct: string; // Maps to `handle` in the schema
  display_name: string; // Maps to `name` in the schema
  locked: boolean; // Maps to `protected` in the schema
  bot: boolean;
  created_at: string; // Corresponds to `published` in the schema
  note: string; // Maps to `bioHtml`
  url: string;
  avatar: string; // Maps to `avatarUrl`
  avatar_static: string; // Static version of the avatar URL
  header: string; // Maps to `coverUrl`
  header_static: string; // Static version of the header URL
  followers_count: number; // Maps to `followersCount`
  following_count: number; // Maps to `followingCount`
  statuses_count: number; // Maps to `postsCount`
  emojis: Array<{ shortcode: string; url: string; static_url: string }>;
  fields: Array<{ name: string; value: string }>;
  moved: null | string; // Could correspond to `successorId` if account moved
  last_status_at: null | string; // Timestamp of the last status update
}

// Define an interface for a Post
interface Post {
  id: string | SQL<unknown>;
  iri: string;
  created_at: string;
  in_reply_to_id: null | string;
  type: SQL<unknown> | "Article" | "Note" | "Question" | undefined;
  sensitive: boolean;
  spoiler_text: string;
  visibility:
    | SQL<unknown>
    | "public"
    | "unlisted"
    | "private"
    | "direct"
    | undefined;
  language: string;
  uri: string;
  url: null | string;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  favourited: boolean;
  reblogged: boolean;
  muted: boolean;
  bookmarked: boolean;
  pinned: boolean;
  content: string;
  reblog: null | Post;
  quote_id: null | string;
  quote: null | Post;
  application: null | string;
  account: ActorProfile;
  media_attachments: Array<{ url: string }>;
  mentions: Array<{ username: string; url: string }>;
  tags: Array<{ name: string }>;
  card: null | { url: string; title: string; description: string };
  emojis: Array<{ shortcode: string; url: string }>;
  emoji_reactions: Array<{ emoji: string; count: number }>;
  poll: null | { options: Array<{ title: string; votes_count: number }> };
  filtered: null | Array<{ filter: string }>;
}

// Define an interface for FollowersData
interface Follower {
  followerId: string;
  followingId: string;
  shares: boolean;
  notify: boolean;
  languages: string[];
  created: StringIterator;
  approved: Date | SQL<unknown> | null | undefined;
  iri: string;
}
interface FollowersData {
  "@context": string;
  id: string;
  type: string;
  orderedItems: Follwer[];
}

// Define an interface for BookmarksData
interface Bookmark {
  postId: string;
  accountOwnerId: string;
  created: Date | SQL<unknown>;
}
interface BookmarksData {
  "@context": string;
  id: string;
  type: string;
  orderedItems: Bookmark;
}

interface List {
  id: string | SQL<unknown>;
  title: string;
  replies_policy: "none" | "list" | "followed";
  exclusive: boolean;
}

interface Mute {
  id: string;
  accountId: string;
  mutedAccountId: string;
  notifications: boolean;
  duration?: string | null;
  created: string;
}

interface Block {
  accountId: string;
  blockedAccountId: string;
  created: string;
}

interface Like {
  postId: string;
  accountId: string;
  created: Date;
}

interface Media {
  id: string;
  postId?: string | null;
  type: string;
  url: string;
  width: number;
  height: number;
  description?: string | null;
  thumbnailType: string;
  thumbnailUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  created: string;
}
