import express from "express";
import {
  deletecomment,
  getallcomment,
  postcomment,
  editcomment,
  likecomment,
  dislikecomment,
  reportcomment,
  getReactionStatus,
  translatecomment,
  getFlaggedComments,
} from "../controllers/comment.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

// Static paths must be registered before the parameterized "/:videoid" route.
routes.get("/flagged/list", getFlaggedComments);
routes.get("/reactions/:userId", requireFirebaseUser, getReactionStatus);

routes.get("/:videoid", getallcomment);
routes.post("/postcomment", requireFirebaseUser, postcomment);
routes.delete("/deletecomment/:id", requireFirebaseUser, deletecomment);
routes.post("/editcomment/:id", requireFirebaseUser, editcomment);

// New endpoints
routes.post("/like/:id", requireFirebaseUser, likecomment);
routes.post("/dislike/:id", requireFirebaseUser, dislikecomment);
routes.post("/report/:id", requireFirebaseUser, reportcomment);
routes.post("/translate/:id", translatecomment);

export default routes;
