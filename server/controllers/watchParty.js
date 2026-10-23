import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import watchParty from "../Modals/WatchParty.js";
import video from "../Modals/video.js";

const ROOM_ID_PATTERN = /^[a-f0-9]{18}$/;
const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;

const validRoomId = (roomId) =>
  typeof roomId === "string" && ROOM_ID_PATTERN.test(roomId);

const publicRoom = (room, videoRecord) => ({
  roomId: room.roomId,
  video: {
    _id: String(videoRecord._id),
    videotitle: videoRecord.videotitle,
  },
  playback: room.playback,
  messages: room.messages,
  hostId: String(room.hostId),
  expiresAt: room.expiresAt,
});

export const createWatchParty = async (req, res) => {
  const { videoId } = req.body;
  if (typeof videoId !== "string" || !mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Select a valid video to start a watch party." });
  }

  try {
    const videoRecord = await video.findById(videoId);
    if (!videoRecord) return res.status(404).json({ message: "Video not found." });

    const room = await watchParty.create({
      roomId: randomBytes(9).toString("hex"),
      videoId: videoRecord._id,
      hostId: req.authenticatedUser._id,
      participantIds: [req.authenticatedUser._id],
      expiresAt: new Date(Date.now() + ROOM_LIFETIME_MS),
    });
    return res.status(201).json({ roomId: room.roomId });
  } catch (error) {
    console.error("Watch party creation failed:", error);
    return res.status(500).json({ message: "Unable to create a watch party." });
  }
};

export const joinWatchParty = async (req, res) => {
  const { roomId } = req.params;
  if (!validRoomId(roomId)) return res.status(400).json({ message: "This watch party link is invalid." });

  try {
    const room = await watchParty.findOneAndUpdate(
      { roomId, expiresAt: { $gt: new Date() } },
      { $addToSet: { participantIds: req.authenticatedUser._id } },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: "This watch party has ended or does not exist." });

    const videoRecord = await video.findById(room.videoId).select("_id videotitle");
    if (!videoRecord) return res.status(404).json({ message: "The video for this watch party is unavailable." });
    return res.status(200).json(publicRoom(room, videoRecord));
  } catch (error) {
    console.error("Watch party join failed:", error);
    return res.status(500).json({ message: "Unable to join this watch party." });
  }
};

export const leaveWatchParty = async (req, res) => {
  const { roomId } = req.params;
  if (!validRoomId(roomId)) return res.status(400).json({ message: "This watch party link is invalid." });

  try {
    await watchParty.updateOne(
      { roomId, expiresAt: { $gt: new Date() } },
      { $pull: { participantIds: req.authenticatedUser._id } }
    );
    return res.status(204).end();
  } catch (error) {
    console.error("Watch party leave failed:", error);
    return res.status(500).json({ message: "Unable to leave this watch party." });
  }
};
