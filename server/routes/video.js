import express from "express";
import { getallvideo, uploadvideo } from "../controllers/video.js";
import upload from "../filehelper/filehelper.js";
import { getVideoPlaybackToken, streamVideo } from "../controllers/media.js";
import { optionalFirebaseUser, requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.post("/upload", requireFirebaseUser, upload.single("file"), uploadvideo);
routes.get("/getall", getallvideo);
routes.get("/:videoId/playback-token", optionalFirebaseUser, getVideoPlaybackToken);
routes.get("/:videoId/stream", streamVideo);
export default routes;
