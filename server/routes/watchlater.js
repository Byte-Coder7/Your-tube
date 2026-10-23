import express from "express";
import {
  getallwatchlater,
  handlewatchlater,
} from "../controllers/watchlater.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();
routes.get("/:userId", requireFirebaseUser, getallwatchlater);
routes.post("/:videoId", requireFirebaseUser, handlewatchlater);
export default routes;
