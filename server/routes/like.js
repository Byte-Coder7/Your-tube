import express from "express";
import { handlelike, getallLikedVideo } from "../controllers/like.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();
routes.get("/:userId", requireFirebaseUser, getallLikedVideo);
routes.post("/:videoId", requireFirebaseUser, handlelike);
export default routes;
