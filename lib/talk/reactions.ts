// The reactions: six in the row, and more behind "More".
//
// ---------------------------------------------------------------------------
// A SHORT ROW FIRST. Every messaging app people already use offers a short row
// of reactions before anything else, and a short row is what makes reacting
// one tap. The six in REACTIONS are that row, unchanged since 1 October 2026.
//
// 🙏 FIRST, ON PURPOSE. This is a church's app, and "I'm praying for you" is
// the reaction a Guide and an Explorer reach for most.
//
// MORE, BUT STILL A LIST. Asked for on 14 November 2026: people wanted to react
// in their own way. MORE_REACTIONS widens the choice without making the
// database column free text, which is a column nobody can promise anything
// about. Every entry is a plain emoji that every phone draws, with nothing a
// church would be embarrassed to see on a child's screen.
//
// THE SAME LIST IS IN THE DATABASE: the check on message_reactions.emoji and
// the list inside react_to(), in the newest migration that names them
// (supabase/migrations/20261114120000_a_conversation_can_say_it_your_way.sql).
// tests/a-conversation-can-reply-react-and-speak.mjs fails if they differ.
// To change the set, change all of them and add a migration; never edit one
// that has run.
// ---------------------------------------------------------------------------

export const REACTIONS = [
  { emoji: '🙏', label: 'Praying' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '👍', label: 'Like' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
] as const;

/** Behind "More" in the menu, in the order they are shown. */
export const MORE_REACTIONS = [
  { emoji: '🙌', label: 'Praise' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🔥', label: 'On fire' },
  { emoji: '💯', label: 'Agree fully' },
  { emoji: '✨', label: 'Sparkle' },
  { emoji: '🤗', label: 'Hug' },
  { emoji: '😊', label: 'Smile' },
  { emoji: '😍', label: 'Love it' },
  { emoji: '🥹', label: 'Touched' },
  { emoji: '😅', label: 'Phew' },
  { emoji: '🤔', label: 'Thinking' },
  { emoji: '😴', label: 'Sleepy' },
  { emoji: '💪', label: 'Strong' },
  { emoji: '🫶', label: 'Heart hands' },
  { emoji: '👀', label: 'Looking' },
  { emoji: '✅', label: 'Done' },
  { emoji: '📖', label: 'Reading' },
  { emoji: '🕊️', label: 'Peace' },
  { emoji: '🌅', label: 'New day' },
  { emoji: '🎵', label: 'Song' },
  { emoji: '💛', label: 'Care' },
  { emoji: '😇', label: 'Blessed' },
  { emoji: '🥳', label: 'Party' },
] as const;

export const ALL_REACTIONS = [...REACTIONS, ...MORE_REACTIONS] as const;

/** What a screen reader says for a reaction. */
export function reactionLabel(emoji: string): string {
  return ALL_REACTIONS.find((r) => r.emoji === emoji)?.label ?? emoji;
}

/** One person's reaction to one message or attachment. */
export interface Reaction {
  id: string;
  pairing_id: string;
  /** Exactly one of these two is set. */
  message_id: string | null;
  media_id: string | null;
  person_id: string;
  emoji: string;
  created_at: string;
}

/** What a reaction is ON. */
export type ReactionTarget = { message: string } | { media: string };
