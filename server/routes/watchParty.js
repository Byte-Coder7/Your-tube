import express from "express";
import { createWatchParty, joinWatchParty, leaveWatchParty } from "../controllers/watchParty.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.post("/", requireFirebaseUser, createWatchParty);
routes.post("/:roomId/join", requireFirebaseUser, joinWatchParty);
routes.post("/:roomId/leave", requireFirebaseUser, leaveWatchParty);

export default routes;
