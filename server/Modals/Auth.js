import mongoose from "mongoose";
const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },
  themeMode: { type: String, enum: ["auto", "light", "dark"], default: "auto" },
  trustedDevices: [{
    _id: false,
    deviceHash: { type: String, required: true },
    ipHash: { type: String, required: true },
    lastVerifiedAt: { type: Date, default: Date.now },
  }],
  plan: { type: String, enum: ["free", "premium", "bronze", "silver", "gold"], default: "free" },
  subscriptionExpiresAt: { type: Date },
  dailyDownloadLimit: { type: Number, min: 1 },
  downloadUsageDate: { type: Date },
  downloadsUsedToday: { type: Number, default: 0, min: 0 },
  watchUsageDate: { type: Date },
  watchSecondsUsedToday: { type: Number, default: 0, min: 0 },
  premiumWatchSecondsUsedToday: { type: Number, default: 0, min: 0 },
  lastWatchHeartbeatAt: { type: Date },
  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);
