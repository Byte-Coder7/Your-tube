import mongoose from "mongoose";

const downloadschema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    videoTitle: { type: String, required: true },
    plan: { type: String, enum: ["free", "premium", "bronze", "silver", "gold"], required: true },
    dailyLimit: { type: Number, default: null },
    countAtDownload: { type: Number, required: true },
    downloadDate: { type: Date, default: Date.now, required: true },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
      required: true,
    },
  },
  { timestamps: true }
);

downloadschema.index({ userId: 1, downloadDate: -1 });

export default mongoose.model("download", downloadschema);