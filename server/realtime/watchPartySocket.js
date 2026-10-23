import jwt from "jsonwebtoken";
import watchParty from "../Modals/WatchParty.js";
import users from "../Modals/Auth.js";

const roomName = (roomId) => `watch-party:${roomId}`;

const getParticipant = (user) => ({
  userId: String(user._id),
  name: user.name || user.channelname || user.email,
  image: user.image || "",
});

const getLiveParticipants = async (io, roomId) => {
  const sockets = await io.in(roomName(roomId)).fetchSockets();
  const participants = new Map();
  for (const socket of sockets) {
    const participant = socket.data.participant;
    if (participant) participants.set(participant.userId, { ...participant, socketId: socket.id });
  }
  return [...participants.values()];
};

const getPlaybackSnapshot = (playback) => {
  const state = playback || { currentTime: 0, isPlaying: false, updatedAt: new Date() };
  const elapsed = state.isPlaying ? (Date.now() - new Date(state.updatedAt).getTime()) / 1000 : 0;
  return {
    currentTime: Math.max(0, state.currentTime + elapsed),
    isPlaying: state.isPlaying,
  };
};

export const configureWatchPartySocket = (io) => {
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const token = cookieHeader.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("yourtube_session="))
      ?.slice("yourtube_session=".length);
    if (!token || !process.env.AUTH_SESSION_SECRET) {
      return next(new Error("Please sign in to join a watch party."));
    }

    let claims;
    try {
      claims = jwt.verify(token, process.env.AUTH_SESSION_SECRET, {
        issuer: "yourtube-api",
        audience: "yourtube-web",
      });
    } catch {
      return next(new Error("Your session is invalid. Please sign in again."));
    }

    try {
      const user = await users.findById(claims.sub).select("_id name channelname email image");
      if (!user) return next(new Error("Your session is no longer valid. Please sign in again."));
      socket.data.user = user;
      socket.data.participant = getParticipant(user);
      return next();
    } catch (error) {
      console.error("Watch party socket authentication failed:", error);
      return next(new Error("Authentication is temporarily unavailable. Please try again."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("party:join", async (event = {}, acknowledge = () => {}) => {
      const roomId = event && typeof event === "object" ? event.roomId : undefined;
      if (typeof roomId !== "string" || !/^[a-f0-9]{18}$/.test(roomId)) {
        return acknowledge({ ok: false, message: "This watch party link is invalid." });
      }
      try {
        const room = await watchParty.findOne({
          roomId,
          participantIds: socket.data.user._id,
          expiresAt: { $gt: new Date() },
        }).select("playback messages");
        if (!room) return acknowledge({ ok: false, message: "You are not a member of this active watch party." });

        socket.data.roomId = roomId;
        await socket.join(roomName(roomId));
        const participants = await getLiveParticipants(io, roomId);
        socket.to(roomName(roomId)).emit("party:participant-joined", {
          ...socket.data.participant,
          socketId: socket.id,
        });
        acknowledge({
          ok: true,
          participants,
          messages: room.messages,
          playback: getPlaybackSnapshot(room.playback),
        });
      } catch (error) {
        console.error("Watch party socket join failed:", error);
        acknowledge({ ok: false, message: "Unable to connect to this watch party." });
      }
    });

    socket.on("party:playback", async (event = {}) => {
      if (!event || typeof event !== "object") return;
      const { roomId } = socket.data;
      const currentTime = Number(event.currentTime);
      if (!roomId || !Number.isFinite(currentTime) || currentTime < 0 ||
          typeof event.isPlaying !== "boolean" ||
          !["play", "pause", "seek"].includes(event.action)) return;

      try {
        const updatedAt = new Date();
        const playback = { currentTime, isPlaying: event.isPlaying, updatedAt };
        const room = await watchParty.findOneAndUpdate(
          { roomId, participantIds: socket.data.user._id, expiresAt: { $gt: updatedAt } },
          { $set: { playback } },
          { new: true }
        ).select("_id");
        if (room) socket.to(roomName(roomId)).emit("party:playback", { currentTime, isPlaying: event.isPlaying, action: event.action });
      } catch (error) {
        console.error("Watch party playback update failed:", error);
        socket.emit("party:error", { message: "Playback could not be synchronized." });
      }
    });

    socket.on("party:message", async (event = {}) => {
      if (!event || typeof event !== "object") return;
      const { roomId } = socket.data;
      const text = typeof event.text === "string" ? event.text.trim() : "";
      if (!roomId || !text || text.length > 1000) return;

      try {
        const message = {
          userId: socket.data.user._id,
          ...socket.data.participant,
          text,
          createdAt: new Date(),
        };
        const room = await watchParty.findOneAndUpdate(
          { roomId, participantIds: socket.data.user._id, expiresAt: { $gt: new Date() } },
          { $push: { messages: { $each: [message], $slice: -100 } } },
          { new: true }
        ).select("_id");
        if (room) io.to(roomName(roomId)).emit("party:message", message);
      } catch (error) {
        console.error("Watch party message failed:", error);
        socket.emit("party:error", { message: "Your message could not be sent." });
      }
    });

    socket.on("party:signal", async (event = {}) => {
      if (!event || typeof event !== "object") return;
      const { roomId } = socket.data;
      const { targetSocketId, signal } = event;
      if (!roomId || typeof targetSocketId !== "string" || !signal || typeof signal !== "object" ||
          !["description", "candidate"].some((key) => key in signal)) return;

      try {
        const isMember = await watchParty.exists({
          roomId,
          participantIds: socket.data.user._id,
          expiresAt: { $gt: new Date() },
        });
        if (!isMember) return;
        const targets = await io.in(roomName(roomId)).fetchSockets();
        const target = targets.find((candidate) => candidate.id === targetSocketId);
        if (!target) return;
        target.emit("party:signal", {
          from: socket.data.participant,
          fromSocketId: socket.id,
          signal,
        });
      } catch (error) {
        console.error("Watch party signaling failed:", error);
        socket.emit("party:error", { message: "The video call connection could not be established." });
      }
    });

    socket.on("disconnect", async () => {
      const { roomId } = socket.data;
      if (!roomId) return;
      const participants = await getLiveParticipants(io, roomId).catch((error) => {
        console.error("Unable to refresh watch party participants:", error);
        return [];
      });
      io.to(roomName(roomId)).emit("party:participants", participants);
    });
  });
};
