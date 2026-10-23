import mongoose from "mongoose";

const watchPartySchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "videofiles", required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  playback: {
    currentTime: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  messages: [{
    _id: false,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    text: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  }],
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export default mongoose.model("watchparties", watchPartySchema);
