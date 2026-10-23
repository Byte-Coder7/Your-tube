import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import downloads from "../Modals/download.js";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import { getEffectivePlan, SUBSCRIPTION_PLANS } from "../utils/subscriptionPlans.js";

const getUtcDayStart = () => {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
};

const getDownloadLimit = (user) =>
  SUBSCRIPTION_PLANS[getEffectivePlan(user)].dailyDownloadLimit;

const getUsage = (user, limit, dayStart) => ({
  plan: getEffectivePlan(user),
  limit,
  used: user.downloadUsageDate?.getTime() === dayStart.getTime()
    ? user.downloadsUsedToday || 0
    : 0,
});

const releaseDownloadSlot = async (userId, dayStart) => {
  await users.updateOne(
    {
      _id: userId,
      downloadUsageDate: dayStart,
      downloadsUsedToday: { $gt: 0 },
    },
    { $inc: { downloadsUsedToday: -1 } }
  );
};

export const getDownloads = async (req, res) => {
  try {
    const user = req.authenticatedUser;
    const dayStart = getUtcDayStart();
    const limit = getDownloadLimit(user);
    const [records, freshUser] = await Promise.all([
      downloads
        .find({ userId: user._id, status: "completed" })
        .sort({ downloadDate: -1 })
        .populate({ path: "videoId", model: "videofiles", select: "filepath videochanel views" })
        .lean(),
      users.findById(user._id),
    ]);

    return res.status(200).json({
      downloads: records,
      usage: getUsage(freshUser || user, limit, dayStart),
    });
  } catch (error) {
    console.error("Download history error:", error);
    return res.status(500).json({ message: "Unable to load download history." });
  }
};

export const downloadVideo = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(404).json({ message: "Video not found." });
  }

  const user = req.authenticatedUser;
  const dayStart = getUtcDayStart();
  const plan = getEffectivePlan(user);
  const limit = getDownloadLimit(user);
  let fileRecord;

  try {
    fileRecord = await video.findById(videoId);
    if (!fileRecord) return res.status(404).json({ message: "Video not found." });

    const uploadRoot = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), fileRecord.filepath);
    const relativePath = path.relative(uploadRoot, filePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return res.status(404).json({ message: "Video file not found." });
    }
    const fileStats = await fs.stat(filePath);
    if (!fileStats.isFile()) return res.status(404).json({ message: "Video file not found." });

    const reservedUser = await users.findOneAndUpdate(
      {
        _id: user._id,
        $or: [
          { downloadUsageDate: { $ne: dayStart } },
          { downloadsUsedToday: { $lt: limit ?? Number.MAX_SAFE_INTEGER } },
        ],
      },
      [
        {
          $set: {
            downloadUsageDate: {
              $cond: [
                { $ne: ["$downloadUsageDate", dayStart] },
                dayStart,
                "$downloadUsageDate",
              ],
            },
            downloadsUsedToday: {
              $cond: [
                { $ne: ["$downloadUsageDate", dayStart] },
                1,
                { $add: [{ $ifNull: ["$downloadsUsedToday", 0] }, 1] },
              ],
            },
          },
        },
      ],
      { new: true }
    );

    if (!reservedUser) {
      const freshUser = await users.findById(user._id);
      const usage = getUsage(freshUser || user, limit, dayStart);
      return res.status(429).json({
        message: "You have reached your daily download limit. Upgrade your plan for more downloads.",
        ...usage,
      });
    }

    const usageCount = reservedUser.downloadsUsedToday;
    let record;
    try {
      record = await downloads.create({
        userId: user._id,
        videoId: fileRecord._id,
        videoTitle: fileRecord.videotitle,
        plan,
        dailyLimit: limit,
        countAtDownload: usageCount,
        downloadDate: new Date(),
        status: "pending",
      });
    } catch (error) {
      await releaseDownloadSlot(user._id, dayStart);
      throw error;
    }

    const downloadName = path.basename(fileRecord.filename || filePath);
    return res.download(filePath, downloadName, async (error) => {
      if (error) {
        await downloads.deleteOne({ _id: record._id });
        await releaseDownloadSlot(user._id, dayStart);
        if (!res.headersSent) {
          res.status(500).json({ message: "Unable to download this video." });
        }
        return;
      }

      try {
        await downloads.updateOne(
          { _id: record._id },
          { $set: { status: "completed" } }
        );
      } catch (trackingError) {
        console.error("Download tracking error:", trackingError);
      }
    });
  } catch (error) {
    console.error("Video download error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Unable to download this video." });
    }
  }
};