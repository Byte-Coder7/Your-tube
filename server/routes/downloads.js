import express from "express";
import { downloadVideo, getDownloads } from "../controllers/downloads.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.get("/", requireFirebaseUser, getDownloads);
routes.post("/:videoId", requireFirebaseUser, downloadVideo);

export default routes;