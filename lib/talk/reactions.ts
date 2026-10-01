// The six reactions, in the order the menu shows them.
//
// ---------------------------------------------------------------------------
// A FIXED SIX, NOT A KEYBOARD. Every messaging app people already use offers a
// short row of reactions before anything else, and a short row is what makes
// reacting one tap. A free choice of emoji would also make the database column
// free text, which is a column nobody can promise anything about.
//
// 🙏 FIRST, ON PURPOSE. This is a church's app, and "I'm praying for you" is
// the reaction a Guide and an Explorer reach for most. It is the one detail of
// the row that is ours rather than borrowed.
//
// THE SAME SIX ARE IN THE DATABASE: the check on message_reactions.emoji and
// the list inside react_to(), in
// supabase/migrations/20261001120000_a_conversation_can_reply_react_and_speak.sql.
// tests/a-conversation-can-reply-react-and-speak.mjs fails if the three differ.
// To change the set, change all three and add a migration; never edit one that
// has run.
// ---------------------------------------------------------------------------

export const REACTIONS = [
  { emoji: '🙏', label: 'Praying' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '👍', label: 'Like' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
] as const;

export type ReactionEmoji = (typeof REACTIONS)[number]['emoji'];

/** What a screen reader says for a reaction. */
export function reactionLabel(emoji: string): string {
  return REACTIONS.find((r) => r.emoji === emoji)?.label ?? emoji;
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
