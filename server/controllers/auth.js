import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import users from "../Modals/Auth.js";
import loginChallenge from "../Modals/LoginChallenge.js";
import { getFirebaseAuth } from "../middleware/requireFirebaseUser.js";

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const CHALLENGE_RETENTION_MS = 20 * 60 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAILS_PER_WINDOW = 5;
const MAX_SENDS_PER_CHALLENGE = 3;
const RESEND_WAIT_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const getFirebaseIdentity = async (req) => {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    const error = new Error("FIREBASE_TOKEN_REQUIRED");
    error.code = "FIREBASE_TOKEN_REQUIRED";
    throw error;
  }
  const decoded = await getFirebaseAuth().verifyIdToken(token);
  if (!decoded.email || !decoded.email_verified) {
    const error = new Error("VERIFIED_EMAIL_REQUIRED");
    error.code = "VERIFIED_EMAIL_REQUIRED";
    throw error;
  }
  return {
    email: decoded.email.toLowerCase(),
    name: decoded.name || "",
    image: decoded.picture || "",
  };
};

const getSecret = (name) => {
  const value = process.env[name];
  if (!value || value.length < 32) {
    const error = new Error("AUTH_CONFIGURATION_MISSING");
    error.code = "AUTH_CONFIGURATION_MISSING";
    throw error;
  }
  return value;
};

const ensureDatabaseConnected = () => {
  if (users.db.readyState !== 1) {
    const error = new Error("ACCOUNT_DATABASE_UNAVAILABLE");
    error.code = "ACCOUNT_DATABASE_UNAVAILABLE";
    throw error;
  }
};

const getAuthFailure = (error) => {
  const code = String(error.code || "");
  if (code === "FIREBASE_ADMIN_NOT_CONFIGURED" || code.startsWith("app/")) {
    return { status: 503, message: "Firebase Admin authentication is not configured on the server." };
  }
  if (code === "AUTH_CONFIGURATION_MISSING") {
    return { status: 503, message: "Authentication security settings are missing on the server." };
  }
  if (code === "ACCOUNT_DATABASE_UNAVAILABLE" || code.startsWith("MONGO") ||
      error.name === "MongooseServerSelectionError" || error.name === "MongoNetworkError" ||
      (error.name === "MongooseError" && error.message.includes("buffering timed out"))) {
    return { status: 503, message: "The account database is unavailable. Check the MongoDB connection and network access list." };
  }
  if (error.message === "EMAIL_CONFIGURATION_MISSING") {
    return { status: 503, message: "Verification email is not configured on the server." };
  }
  if (code === "INVALID_DEVICE") {
    return { status: 400, message: "Unable to verify this device. Please try again." };
  }
  if (code === "FIREBASE_TOKEN_REQUIRED") {
    return { status: 401, message: "Google sign-in did not provide a Firebase identity token. Sign in again." };
  }
  if (code === "VERIFIED_EMAIL_REQUIRED") {
    return { status: 401, message: "The Google account must have a verified email address." };
  }
  if (code.startsWith("auth/")) {
    return { status: 401, message: "Firebase could not verify this Google sign-in token. Sign in again." };
  }
  if (code === "ACCOUNT_NOT_FOUND") {
    return { status: 401, message: "The account could not be found. Sign in again." };
  }
  return { status: 500, message: "Sign-in verification failed on the server. Please try again." };
};

const sendAuthFailure = (res, error, operation) => {
  const failure = getAuthFailure(error);
  if (failure.status >= 500) {
    console.error(`${operation} failed:`, {
      code: error.code || "UNCLASSIFIED",
      name: error.name || "Error",
    });
  }
  return res.status(failure.status).json({ message: failure.message });
};

const keyedHash = (secretName, value) =>
  createHmac("sha256", getSecret(secretName)).update(value).digest("hex");

const readDeviceAndIp = (req, deviceId) => {
  if (typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(deviceId)) {
    throw new Error("INVALID_DEVICE");
  }
  return {
    deviceHash: keyedHash("DEVICE_HASH_SECRET", deviceId),
    ipHash: keyedHash("DEVICE_HASH_SECRET", req.ip || req.socket.remoteAddress || "unknown"),
  };
};

const publicUser = (user) => {
  const result = user.toObject();
  delete result.trustedDevices;
  delete result.__v;
  return result;
};

const createSession = (res, user) => {
  const token = jwt.sign(
    { email: user.email },
    getSecret("AUTH_SESSION_SECRET"),
    { subject: String(user._id), expiresIn: "12h", issuer: "yourtube-api", audience: "yourtube-web" }
  );
  const sameSite = process.env.AUTH_COOKIE_SAME_SITE || "lax";
  res.cookie("yourtube_session", token, {
    httpOnly: true,
    secure: process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    sameSite,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
  return { result: publicUser(user) };
};

const maskEmail = (email) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(local.length - 1, 6)))}@${domain}`;
};

const hashOtp = (challengeId, otp) =>
  keyedHash("OTP_HASH_SECRET", `${challengeId}:${otp}`);

const sendOtpEmail = async (user, otp) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    throw new Error("EMAIL_CONFIGURATION_MISSING");
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  await transporter.sendMail({
    from: SMTP_FROM,
    to: user.email,
    subject: "Your YourTube verification code",
    text: `Your YourTube verification code is ${otp}. It expires in 5 minutes. If you did not try to sign in, secure your Google account.`,
  });
};

const countRecentEmails = async (userId) => {
  const recentChallenges = await loginChallenge.find({
    userId,
    createdAt: { $gte: new Date(Date.now() - SEND_WINDOW_MS) },
  }).select("sendCount").lean();
  return recentChallenges.reduce((count, challenge) => count + challenge.sendCount, 0);
};

const deliverChallenge = async (user, challenge) => {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  challenge.otpHash = hashOtp(String(challenge._id), otp);
  challenge.otpExpiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
  challenge.lastSentAt = new Date();
  challenge.emailSentAt = undefined;
  challenge.attempts = 0;
  await challenge.save();
  await sendOtpEmail(user, otp);
  challenge.emailSentAt = new Date();
  await challenge.save();
};

const getLoginContext = async (req) => {
  const identity = await getFirebaseIdentity(req);
  const device = readDeviceAndIp(req, req.body.deviceId);
  ensureDatabaseConnected();
  let user = await users.findOne({ email: identity.email });
  if (!user) {
    user = await users.create({ email: identity.email, name: identity.name, image: identity.image });
  } else {
    if (identity.name && identity.name !== user.name) user.name = identity.name;
    if (identity.image && identity.image !== user.image) user.image = identity.image;
    await user.save();
  }
  return { user, device };
};

export const login = async (req, res) => {
  try {
    const { user, device } = await getLoginContext(req);
    getSecret("AUTH_SESSION_SECRET");
    const trusted = user.trustedDevices.find((item) => item.deviceHash === device.deviceHash);
    if (trusted && trusted.ipHash === device.ipHash) {
      trusted.lastVerifiedAt = new Date();
      await user.save();
      return res.status(200).json(createSession(res, user));
    }

    getSecret("OTP_HASH_SECRET");
    const now = new Date();
    let challenge = await loginChallenge.findOne({
      userId: user._id,
      deviceHash: device.deviceHash,
      ipHash: device.ipHash,
      verifiedAt: null,
      otpExpiresAt: { $gt: now },
      emailSentAt: { $ne: null },
    });
    if (!challenge) {
      if (await countRecentEmails(user._id) >= MAX_EMAILS_PER_WINDOW) {
        return res.status(429).json({ message: "Too many verification emails. Try again later." });
      }
      challenge = await loginChallenge.create({
        userId: user._id,
        ...device,
        otpHash: "pending",
        otpExpiresAt: new Date(Date.now() + OTP_LIFETIME_MS),
        cleanupAt: new Date(Date.now() + CHALLENGE_RETENTION_MS),
        lastSentAt: now,
        sendCount: 1,
      });
      try {
        await deliverChallenge(user, challenge);
      } catch {
        return res.status(503).json({ message: "Verification email could not be sent. Check email server configuration." });
      }
    }
    return res.status(202).json({
      requiresOtp: true,
      challengeId: String(challenge._id),
      email: maskEmail(user.email),
    });
  } catch (error) {
    return sendAuthFailure(res, error, "Login verification");
  }
};

const getAuthenticatedFirebaseUser = async (req) => {
  const identity = await getFirebaseIdentity(req);
  ensureDatabaseConnected();
  const user = await users.findOne({ email: identity.email });
  if (!user) throw new Error("ACCOUNT_NOT_FOUND");
  return user;
};

export const verifyOtp = async (req, res) => {
  try {
    const user = await getAuthenticatedFirebaseUser(req);
    const { challengeId, code, deviceId } = req.body;
    const device = readDeviceAndIp(req, deviceId);
    getSecret("AUTH_SESSION_SECRET");
    getSecret("OTP_HASH_SECRET");
    if (!mongoose.Types.ObjectId.isValid(challengeId) || !/^\d{6}$/.test(code || "")) {
      return res.status(400).json({ message: "Enter the six-digit code from your email." });
    }
    const challenge = await loginChallenge.findOne({
      _id: challengeId,
      userId: user._id,
      deviceHash: device.deviceHash,
      ipHash: device.ipHash,
      verifiedAt: null,
    });
    if (!challenge || challenge.otpExpiresAt <= new Date()) {
      return res.status(400).json({ message: "This verification code has expired. Request a new code." });
    }
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ message: "Too many incorrect codes. Request a new code." });
    }
    const actualHash = Buffer.from(hashOtp(String(challenge._id), code), "hex");
    const expectedHash = Buffer.from(challenge.otpHash || "", "hex");
    if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
      await loginChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ message: "That code is not valid." });
    }
    const claimedChallenge = await loginChallenge.findOneAndUpdate(
      { _id: challenge._id, verifiedAt: null, attempts: { $lt: MAX_OTP_ATTEMPTS } },
      { $set: { verifiedAt: new Date(), otpHash: null } },
      { new: true }
    );
    if (!claimedChallenge) return res.status(400).json({ message: "This verification code was already used." });

    const trusted = user.trustedDevices.find((item) => item.deviceHash === device.deviceHash);
    if (trusted) {
      trusted.ipHash = device.ipHash;
      trusted.lastVerifiedAt = new Date();
    } else {
      if (user.trustedDevices.length >= 10) user.trustedDevices.shift();
      user.trustedDevices.push({ ...device, lastVerifiedAt: new Date() });
    }
    await user.save();
    return res.status(200).json(createSession(res, user));
  } catch (error) {
    return sendAuthFailure(res, error, "OTP verification");
  }
};

export const resendOtp = async (req, res) => {
  try {
    const user = await getAuthenticatedFirebaseUser(req);
    const { challengeId, deviceId } = req.body;
    const device = readDeviceAndIp(req, deviceId);
    getSecret("OTP_HASH_SECRET");
    if (!mongoose.Types.ObjectId.isValid(challengeId)) {
      return res.status(400).json({ message: "Request a new sign-in verification." });
    }
    const challenge = await loginChallenge.findOne({
      _id: challengeId,
      userId: user._id,
      deviceHash: device.deviceHash,
      ipHash: device.ipHash,
      verifiedAt: null,
    });
    if (!challenge || challenge.cleanupAt <= new Date()) {
      return res.status(400).json({ message: "This verification request has expired. Sign in again." });
    }
    if (Date.now() - challenge.lastSentAt.getTime() < RESEND_WAIT_MS) {
      return res.status(429).json({ message: "Wait a minute before requesting another code." });
    }
    if (challenge.sendCount >= MAX_SENDS_PER_CHALLENGE ||
        await countRecentEmails(user._id) >= MAX_EMAILS_PER_WINDOW) {
      return res.status(429).json({ message: "Too many verification emails. Try again later." });
    }
    challenge.sendCount += 1;
    try {
      await deliverChallenge(user, challenge);
    } catch {
      return res.status(503).json({ message: "Verification email could not be sent. Check email server configuration." });
    }
    return res.status(200).json({ message: "A new verification code was sent." });
  } catch (error) {
    return sendAuthFailure(res, error, "OTP resend");
  }
};

export const updateprofile = async (req, res) => {
  const { id } = req.params;
  const { channelname, description } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id) || String(req.authenticatedUser._id) !== id) {
    return res.status(403).json({ message: "User unavailable." });
  }
  try {
    const user = await users.findByIdAndUpdate(
      id,
      { $set: { channelname, description } },
      { new: true }
    );
    return res.status(200).json(publicUser(user));
  } catch (error) {
    console.error("Profile update error:", error.message);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const updateTheme = async (req, res) => {
  const { themeMode } = req.body;
  if (!["auto", "light", "dark"].includes(themeMode)) {
    return res.status(400).json({ message: "Choose auto, light, or dark theme." });
  }
  req.authenticatedUser.themeMode = themeMode;
  await req.authenticatedUser.save();
  return res.status(200).json({ themeMode });
};

export const logout = (req, res) => {
  res.clearCookie("yourtube_session", { path: "/" });
  return res.status(204).end();
};
