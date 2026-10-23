import express from "express";
import { login, logout, resendOtp, updateprofile, updateTheme, verifyOtp } from "../controllers/auth.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";
const routes = express.Router();

routes.post("/login", login);
routes.post("/otp/verify", verifyOtp);
routes.post("/otp/resend", resendOtp);
routes.post("/logout", logout);
routes.patch("/update/:id", requireFirebaseUser, updateprofile);
routes.patch("/theme", requireFirebaseUser, updateTheme);
export default routes;
