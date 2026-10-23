import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";
import users from "../Modals/Auth.js";

export const getFirebaseAuth = () => {
  if (getApps().length) return getAuth();

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    const error = new Error("Firebase Admin credentials are not configured");
    error.code = "FIREBASE_ADMIN_NOT_CONFIGURED";
    throw error;
  }

  const app = initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  return getAuth(app);
};

const loadFirebaseUser = async (req, res, next, optional) => {
  const authorization = req.headers.authorization || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const cookieToken = (req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("yourtube_session="))
    ?.slice("yourtube_session=".length);
  const token = cookieToken || bearerToken;

  if (!token) {
    if (optional) return next();
    return res.status(401).json({ message: "Please sign in to continue." });
  }

  try {
    if (!process.env.AUTH_SESSION_SECRET) {
      return res.status(503).json({ message: "Authentication service is not configured." });
    }
    const decodedToken = jwt.verify(token, process.env.AUTH_SESSION_SECRET, {
      issuer: "yourtube-api",
      audience: "yourtube-web",
    });
    const user = await users.findById(decodedToken.sub);
    if (!user) {
      return res.status(401).json({ message: "Please sign in to continue." });
    }

    req.authenticatedUser = user;
    const ownerId = String(user._id);
    const requestedUserId = req.params.userId || req.body?.userId || req.body?.userid;
    if (requestedUserId && String(requestedUserId) !== ownerId) {
      return res.status(403).json({ message: "You cannot access another user's account." });
    }
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Your session is invalid. Please sign in again." });
  }
};

export const requireFirebaseUser = (req, res, next) =>
  loadFirebaseUser(req, res, next, false);

export const optionalFirebaseUser = (req, res, next) =>
  loadFirebaseUser(req, res, next, true);