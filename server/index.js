import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import downloadroutes from "./routes/downloads.js";
import subscriptionroutes from "./routes/subscriptions.js";
import watchPartyRoutes from "./routes/watchParty.js";
import { Server } from "socket.io";
import { configureWatchPartySocket } from "./realtime/watchPartySocket.js";
dotenv.config();
const app = express();
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
const allowedOrigins = new Set([process.env.FRONTEND_URL || "http://localhost:3000"]);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:3000");
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
}));
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.get("/", (req, res) => {
  res.send("You tube backend is working");
});
app.use(bodyParser.json());
app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/watch", watchlaterroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
app.use("/downloads", downloadroutes);
app.use("/subscriptions", subscriptionroutes);
app.use("/watch-party", watchPartyRoutes);
const PORT = process.env.PORT || 5000;

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: [...allowedOrigins], credentials: true },
});
configureWatchPartySocket(io);

const DBURL = process.env.DB_URL;
mongoose
  .connect(DBURL)
  .then(() => {
    console.log("Mongodb connected");
    server.listen(PORT, () => {
      console.log(`server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", {
      name: error.name || "Error",
      code: error.code || "UNCLASSIFIED",
    });
    process.exitCode = 1;
  });
