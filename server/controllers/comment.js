import comment from "../Modals/comment.js";
import commentReaction from "../Modals/commentReaction.js";
import mongoose from "mongoose";
import { moderateComment } from "../utils/moderation.js";
import { translateText } from "../utils/translate.js";

export const postcomment = async (req, res) => {
  const { commentbody, videoid, userid, usercommented, userlocation } =
    req.body;
  try {
    // Moderation: block abusive/spam/special-char comments before saving.
    const existingComments = await comment.find({ videoid: videoid });
    const moderation = moderateComment(commentbody, existingComments);
    if (moderation.blocked) {
      return res.status(400).json({ message: moderation.reason });
    }

    const postcomment = new comment({
      videoid,
      userid,
      commentbody,
      usercommented,
      commentedon: new Date(),
      likes: 0,
      dislikes: 0,
      reports: 0,
      flagged: false,
      userlocation: userlocation || "",
    });
    await postcomment.save();
    return res.status(200).json({ comment: true, data: postcomment });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  try {
    const commentvideo = await comment.find({ videoid: videoid });
    return res.status(200).json(commentvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const deletecomment = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    // Remove associated reactions as well.
    await commentReaction.deleteMany({ commentid: _id });
    await comment.findByIdAndDelete(_id);
    return res.status(200).json({ comment: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const editcomment = async (req, res) => {
  const { id: _id } = req.params;
  const { commentbody } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("comment unavailable");
  }
  // Re-run moderation on the edited content.
  const existingComment = await comment.findById(_id).lean();
  if (!existingComment) {
    return res.status(404).send("comment unavailable");
  }
  const moderation = moderateComment(commentbody, []);
  if (moderation.blocked) {
    return res.status(400).json({ message: moderation.reason });
  }
  try {
    const updatecomment = await comment.findByIdAndUpdate(_id, {
      $set: { commentbody: commentbody },
    });
    res.status(200).json(updatecomment);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// ---------- Like / Dislike ----------

/**
 * Toggle like. Calling twice from the same user unlikes.
 * A user state cannot be both liked and disliked at once.
 */
export const likecomment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(commentId) || !userId) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const current = await commentReaction.findOne({
      commentid: commentId,
      userid: userId,
    });

    if (current && current.type === "like") {
      // Unlike
      await commentReaction.findByIdAndDelete(current._id);
      await comment.findByIdAndUpdate(commentId, { $inc: { likes: -1 } });
      return res.status(200).json({ liked: false, message: "Like removed" });
    }

    if (current && current.type === "dislike") {
      // Switch dislike -> like
      current.type = "like";
      await current.save();
      await comment.findByIdAndUpdate(commentId, {
        $inc: { likes: 1, dislikes: -1 },
      });
      return res.status(200).json({ liked: true, message: "Liked" });
    }

    // New like
    await commentReaction.create({ commentid: commentId, userid: userId, type: "like" });
    await comment.findByIdAndUpdate(commentId, { $inc: { likes: 1 } });
    return res.status(200).json({ liked: true, message: "Liked" });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

/**
 * Toggle dislike. A user state cannot be both liked and disliked at once.
 */
export const dislikecomment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(commentId) || !userId) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const current = await commentReaction.findOne({
      commentid: commentId,
      userid: userId,
    });

    if (current && current.type === "dislike") {
      // Remove dislike
      await commentReaction.findByIdAndDelete(current._id);
      await comment.findByIdAndUpdate(commentId, { $inc: { dislikes: -1 } });
      return res.status(200).json({ disliked: false, message: "Dislike removed" });
    }

    if (current && current.type === "like") {
      // Switch like -> dislike
      current.type = "dislike";
      await current.save();
      await comment.findByIdAndUpdate(commentId, {
        $inc: { likes: -1, dislikes: 1 },
      });
      return res.status(200).json({ disliked: true, message: "Disliked" });
    }

    // New dislike
    await commentReaction.create({ commentid: commentId, userid: userId, type: "dislike" });
    await comment.findByIdAndUpdate(commentId, { $inc: { dislikes: 1 } });
    return res.status(200).json({ disliked: true, message: "Disliked" });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// ---------- Report ----------

/**
 * Report a comment. Flags it for review and increments the report count.
 * A single user can only report once. Reports do NOT auto-delete.
 */
export const reportcomment = async (req, res) => {
  const { id: commentId } = req.params;
  const { userId, reason } = req.body;
  if (!mongoose.Types.ObjectId.isValid(commentId) || !userId) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const existing = await commentReaction.findOne({
      commentid: commentId,
      userid: userId,
      type: "report",
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "You have already reported this comment" });
    }

    await commentReaction.create({
      commentid: commentId,
      userid: userId,
      type: "report",
      reason: reason || "",
    });
    // Mark flagged and increment report count. Do NOT delete.
    await comment.findByIdAndUpdate(commentId, {
      $inc: { reports: 1 },
      $set: { flagged: true },
    });
    return res
      .status(200)
      .json({ reported: true, message: "Thanks! The comment has been reported for review." });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// ---------- Reaction Status (for a logged-in user) ----------

/**
 * Returns the current user's reaction (like/dislike/report) for each comment.
 */
export const getReactionStatus = async (req, res) => {
  const { userId } = req.params;
  try {
    const reactions = await commentReaction.find({ userid: userId }).lean();
    return res.status(200).json({ reactions });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// ---------- Translation ----------

export const translatecomment = async (req, res) => {
  const { id: commentId } = req.params;
  const { target } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(404).send("comment unavailable");
  }
  try {
    const found = await comment.findById(commentId).lean();
    if (!found) {
      return res.status(404).send("comment unavailable");
    }
    const targetLang = (target || "en").slice(0, 10);
    const translated = await translateText(found.commentbody, targetLang);
    return res.status(200).json({ translated, target: targetLang });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Translation failed. Please try again." });
  }
};

// ---------- Admin / Moderator ----------

/**
 * List flagged (reported) comments for moderation review.
 */
export const getFlaggedComments = async (req, res) => {
  try {
    const flagged = await comment.find({ flagged: true }).sort({ reports: -1 });
    return res.status(200).json(flagged);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};