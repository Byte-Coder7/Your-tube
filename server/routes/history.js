import express from "express";
import {
  getallhistoryVideo,
  handlehistory,
  handleview,
} from "../controllers/history.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();
routes.get("/:userId", requireFirebaseUser, getallhistoryVideo);
routes.post("/views/:videoId", handleview);
routes.post("/:videoId", requireFirebaseUser, handlehistory);
export default routes;
