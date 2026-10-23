import mongoose from "mongoose";

/**
 * Tracks a single user's reaction to a comment.
 * The compound unique index (commentid, userid) guarantees that a user
 * can only have ONE reaction (like / dislike / report) per comment.
 */
const commentReactionSchema = mongoose.Schema(
  {
    commentid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
    },
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    // "like" | "dislike" | "report"
    type: {
      type: String,
      enum: ["like", "dislike", "report"],
      required: true,
    },
    // Optional reason for reports
    reason: { type: String },
  },
  {
    timestamps: true,
  }
);

// Prevent the same user from reacting twice to the same comment.
commentReactionSchema.index({ commentid: 1, userid: 1 }, { unique: true });

export default mongoose.model("commentreaction", commentReactionSchema);