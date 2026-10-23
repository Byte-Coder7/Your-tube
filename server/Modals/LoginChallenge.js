import mongoose from "mongoose";

const loginChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  deviceHash: { type: String, required: true },
  ipHash: { type: String, required: true },
  otpHash: { type: String },
  otpExpiresAt: { type: Date, required: true },
  cleanupAt: { type: Date, required: true, expires: 0 },
  lastSentAt: { type: Date, required: true },
  emailSentAt: { type: Date },
  sendCount: { type: Number, default: 1 },
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model("loginchallenge", loginChallengeSchema);