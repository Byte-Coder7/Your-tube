/**
 * Comment moderation utilities.
 * Detects abusive/offensive words, obvious spam, and repeated comments
 * containing excessive/suspicious special characters.
 */

// A small, configurable blocklist. In production you can extend this or load
// from an external source. Words are matched as whole words (case insensitive).
const ABUSIVE_WORDS = [
  "dumb",
  "stupid",
  "idiot",
  "hate",
  "loser",
  "moron",
  // Add more as needed. Keep it reasonable for a demo.
];

// Maximum ratio of special characters allowed in a comment before flagging.
const MAX_SPECIAL_CHAR_RATIO = 0.4;
// Maximum number of repeated characters (e.g. "aaaa") allowed.
const MAX_REPEATED_CHAR = 6;
// Maximum allowed repeated comment count (same normalized text posted repeatedly).
const REPEAT_COMMENT_LIMIT = 3;

// Characters that are not alphanumeric or whitespace.
const SPECIAL_CHAR_REGEX = /[^a-zA-Z0-9\s]/g;

/**
 * Normalize text for comparison: lowercase, trim, collapse whitespace.
 */
const normalize = (text = "") => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Detect abusive/offensive words in the comment.
 * @returns {string|null} the offending word or null
 */
export const detectAbusiveWord = (text = "") => {
  const lower = text.toLowerCase();
  const words = lower.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/);
  const found = ABUSIVE_WORDS.find((word) => {
    // match whole word
    return words.includes(word.toLowerCase());
  });
  return found || null;
};

/**
 * Detect suspicious special-char usage (e.g. "!!!!!", "???", "~~~~").
 * @returns {boolean}
 */
export const detectExcessiveSpecialChars = (text = "") => {
  if (!text) return false;

  // Count total special characters.
  const specialMatches = text.match(SPECIAL_CHAR_REGEX) || [];
  const specialCount = specialMatches.length;
  const ratio = text.length ? specialCount / text.length : 0;
  if (ratio > MAX_SPECIAL_CHAR_RATIO) return true;

  // Detect runs of repeated identical characters.
  const repeatRegex = /(.)\1{MAXCOUNT,}/g;
  const dynamicRegex = new RegExp(`(.)\\1{${MAX_REPEATED_CHAR - 1},}`, "g");
  if (dynamicRegex.test(text)) return true;

  // Detect strings of 3+ punctuation marks (??? !!! ~~~).
  const punctRunRegex = /([?!.~#*+=\-]{3,})/;
  if (punctRunRegex.test(text)) return true;

  return false;
};

/**
 * Detect obvious spam:
 *  - contains many URLs
 *  - ALL-CAPS shouting
 *  - repeated/likely duplicate comments exceeding the limit
 *
 * @param {string} text
 * @param {Array} existingComments bodies of the same video
 * @returns {string|null} reason string or null
 */
export const detectSpam = (text = "", existingComments = []) => {
  // URL spam
  const urlCount = (text.match(/https?:\/\/\S+/gi) || []).length;
  if (urlCount >= 3) return "Contains too many links";

  // ALL-CAPS shouting
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const upper = (text.match(/[A-Z]/g) || []).length;
  if (letters > 10 && upper / letters > 0.8) return "Comment appears to be all caps";

  // Repeated duplicate comments from the same author/session
  const normalized = normalize(text);
  if (!normalized) return null;
  let count = 0;
  for (const existing of existingComments) {
    if (normalize(existing.commentbody) === normalized) {
      count += 1;
      if (count >= REPEAT_COMMENT_LIMIT - 1) {
        return "This comment has been posted too many times";
      }
    }
  }
  return null;
};

/**
 * Full moderation check. Returns { blocked: boolean, reason: string|null }.
 */
export const moderateComment = (text = "", existingComments = []) => {
  if (!text || !text.trim()) {
    return { blocked: true, reason: "Comment cannot be empty" };
  }

  const abusive = detectAbusiveWord(text);
  if (abusive) {
    return {
      blocked: true,
      reason: "Your comment contains language that violates our community guidelines.",
    };
  }

  if (detectExcessiveSpecialChars(text)) {
    return {
      blocked: true,
      reason: "Your comment contains too many special characters.",
    };
  }

  const spamReason = detectSpam(text, existingComments);
  if (spamReason) {
    return { blocked: true, reason: `Spam detected: ${spamReason}` };
  }

  return { blocked: false, reason: null };
};
