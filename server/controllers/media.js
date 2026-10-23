import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import { getEffectivePlan, SUBSCRIPTION_PLANS } from "../utils/subscriptionPlans.js";

const getUsage = (user) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const isToday = user?.watchUsageDate?.getTime() === today.getTime();
  return {
    total: isToday ? user.watchSecondsUsedToday || 0 : 0,
    premium: isToday ? user.premiumWatchSecondsUsedToday || 0 : 0,
  };
};

const canPlay = (user, isPremium) => {
  if (!isPremium) return true;
  if (!user) return false;
  const planId = getEffectivePlan(user);
  const plan = SUBSCRIPTION_PLANS[planId];
  const usage = getUsage(user);
  const limit = planId === "free" ? plan.premiumWatchLimitSeconds : plan.watchLimitSeconds;
  const used = planId === "free" ? usage.premium : usage.total;
  return limit === null || used < limit;
};

export const getVideoPlaybackToken = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(404).json({ message: "Video not found." });
  }
  const secret = process.env.MEDIA_TOKEN_SECRET;
  if (!secret) return res.status(503).json({ message: "Video playback is not configured." });

  try {
    const [fileRecord, user] = await Promise.all([
      video.findById(videoId),
      req.authenticatedUser ? users.findById(req.authenticatedUser._id) : null,
    ]);
    if (!fileRecord) return res.status(404).json({ message: "Video not found." });
    if (!canPlay(user, Boolean(fileRecord.isPremium))) {
      return res.status(user ? 429 : 401).json({
        message: user
          ? "Your daily watch-time limit has been reached."
          : "Sign in to watch premium videos.",
      });
    }

    const token = jwt.sign(
      { videoId: String(fileRecord._id), userId: user ? String(user._id) : null },
      secret,
      { expiresIn: "6h" }
    );
    return res.status(200).json({ token });
  } catch (error) {
    console.error("Playback token error:", error);
    return res.status(500).json({ message: "Unable to prepare video playback." });
  }
};

export const streamVideo = async (req, res) => {
  const secret = process.env.MEDIA_TOKEN_SECRET;
  const token = req.query.token;
  if (!secret || typeof token !== "string") {
    return res.status(401).json({ message: "A valid playback token is required." });
  }

  try {
    const claims = jwt.verify(token, secret);
    if (claims.videoId !== req.params.videoId) {
      return res.status(401).json({ message: "Playback token is invalid for this video." });
    }
    const fileRecord = await video.findById(req.params.videoId);
    if (!fileRecord) return res.status(404).json({ message: "Video not found." });
    const user = claims.userId ? await users.findById(claims.userId) : null;
    if (claims.userId && !user) return res.status(401).json({ message: "Your account is unavailable." });
    if (!canPlay(user, Boolean(fileRecord.isPremium))) {
      return res.status(429).json({ message: "Your daily watch-time limit has been reached." });
    }

    const uploadRoot = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), fileRecord.filepath);
    const relativePath = path.relative(uploadRoot, filePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return res.status(404).json({ message: "Video file not found." });
    }
    const fileStats = await fs.stat(filePath);
    if (!fileStats.isFile()) return res.status(404).json({ message: "Video file not found." });

    res.set("Cache-Control", "private, no-store");
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: "Video file not found." });
    });
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Playback token is invalid or expired." });
    }
    console.error("Video streaming error:", error);
    if (!res.headersSent) return res.status(500).json({ message: "Unable to play this video." });
  }
};