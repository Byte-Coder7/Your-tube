import express from "express";
import {
  createSubscriptionOrder,
  getSubscriptionPlans,
  getSubscriptionStatus,
  recordWatchHeartbeat,
  verifySubscriptionPayment,
} from "../controllers/subscriptions.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";

const routes = express.Router();

routes.get("/plans", getSubscriptionPlans);
routes.get("/status", requireFirebaseUser, getSubscriptionStatus);
routes.post("/order", requireFirebaseUser, createSubscriptionOrder);
routes.post("/verify", requireFirebaseUser, verifySubscriptionPayment);
routes.post("/watch-time", requireFirebaseUser, recordWatchHeartbeat);

export default routes;