import crypto from "node:crypto";
import nodemailer from "nodemailer";
import Razorpay from "razorpay";
import mongoose from "mongoose";
import subscriptionPayment from "../Modals/subscriptionPayment.js";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import { getEffectivePlan, SUBSCRIPTION_PLANS } from "../utils/subscriptionPlans.js";

const getUtcDayStart = (date = new Date()) => {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
};

const getRazorpay = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay test credentials are not configured");
  }
  if (!RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
    throw new Error("Razorpay test credentials are required");
  }
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
};

const getUsage = (user, now = new Date()) => {
  const plan = getEffectivePlan(user, now);
  const entitlements = SUBSCRIPTION_PLANS[plan];
  const dayStart = getUtcDayStart(now);
  const watchIsToday = user.watchUsageDate?.getTime() === dayStart.getTime();
  const downloadIsToday = user.downloadUsageDate?.getTime() === dayStart.getTime();
  const watchUsed = watchIsToday ? user.watchSecondsUsedToday || 0 : 0;
  const premiumWatchUsed = watchIsToday ? user.premiumWatchSecondsUsedToday || 0 : 0;
  const watchLimit = plan === "free"
    ? entitlements.premiumWatchLimitSeconds
    : entitlements.watchLimitSeconds;
  const watchUsedForLimit = plan === "free" ? premiumWatchUsed : watchUsed;

  return {
    plan,
    entitlements,
    watchSecondsUsedToday: watchUsed,
    premiumWatchSecondsUsedToday: premiumWatchUsed,
    watchSecondsRemaining: watchLimit === null
      ? null
      : Math.max(0, watchLimit - watchUsedForLimit),
    downloadsUsedToday: downloadIsToday ? user.downloadsUsedToday || 0 : 0,
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
  };
};

const sendInvoiceEmail = async (payment, user) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    console.warn("SMTP is not configured; subscription confirmation email was not sent.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  const plan = SUBSCRIPTION_PLANS[payment.plan];
  const paidAt = payment.paidAt?.toISOString() || new Date().toISOString();
  const amount = (payment.amount / 100).toFixed(2);
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: payment.email,
    subject: `Your ${plan.name} subscription is active`,
    text: [
      `Hello ${user.name || "there"},`,
      `Your ${plan.name} subscription is active until ${payment.expiresAt.toISOString()}.`,
      `Invoice: ${payment.invoiceNumber}`,
      `Amount: ${payment.currency} ${amount}`,
      `Razorpay order: ${payment.orderId}`,
      `Razorpay payment: ${payment.paymentId}`,
      `Paid at: ${paidAt}`,
    ].join("\n"),
  });
  return true;
};

export const getSubscriptionPlans = (_req, res) => {
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({ id, ...plan }));
  return res.status(200).json({ plans });
};

export const getSubscriptionStatus = async (req, res) => {
  const user = await users.findById(req.authenticatedUser._id).lean();
  return res.status(200).json({ ...getUsage(user || req.authenticatedUser) });
};

export const createSubscriptionOrder = async (req, res) => {
  const { plan: planId } = req.body;
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan || planId === "free") {
    return res.status(400).json({ message: "Choose a paid subscription plan." });
  }

  try {
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: plan.amount,
      currency: plan.currency,
      receipt: `sub_${req.authenticatedUser._id}_${Date.now()}`.slice(0, 40),
      notes: { userId: String(req.authenticatedUser._id), plan: planId },
    });
    await subscriptionPayment.create({
      userId: req.authenticatedUser._id,
      email: req.authenticatedUser.email,
      plan: planId,
      orderId: order.id,
      amount: plan.amount,
      currency: plan.currency,
    });
    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan: planId,
      name: plan.name,
    });
  } catch (error) {
    if (error.message.startsWith("Razorpay test credentials")) {
      return res.status(503).json({ message: "Test payments are not configured." });
    }
    console.error("Subscription order error:", error);
    return res.status(500).json({ message: "Unable to start subscription checkout." });
  }
};

export const verifySubscriptionPayment = async (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body;
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ message: "Payment verification details are incomplete." });
  }

  try {
    const payment = await subscriptionPayment.findOne({ orderId, userId: req.authenticatedUser._id });
    if (!payment) return res.status(404).json({ message: "Subscription order not found." });

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return res.status(503).json({ message: "Test payments are not configured." });
    const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
    const received = Buffer.from(signature, "hex");
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      return res.status(400).json({ message: "Payment signature could not be verified." });
    }

    const razorpay = getRazorpay();
    const capturedPayment = await razorpay.payments.fetch(paymentId);
    if (
      capturedPayment.order_id !== orderId ||
      capturedPayment.status !== "captured" ||
      capturedPayment.amount !== payment.amount ||
      capturedPayment.currency !== payment.currency
    ) {
      return res.status(400).json({ message: "The payment has not been captured for this order." });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_PLANS[payment.plan].durationDays * 86400000);
    const invoiceNumber = `YT-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${orderId.slice(-8).toUpperCase()}`;
    const paidPayment = await subscriptionPayment.findOneAndUpdate(
      { orderId, status: "created" },
      { $set: { paymentId, paidAt: now, expiresAt, invoiceNumber, status: "paid" } },
      { new: true }
    ) || await subscriptionPayment.findOne({ orderId, status: "paid" });
    if (!paidPayment || paidPayment.paymentId !== paymentId) {
      return res.status(409).json({ message: "This order has already been used." });
    }

    const updatedUser = await users.findByIdAndUpdate(
      req.authenticatedUser._id,
      {
        $set: {
          plan: paidPayment.plan,
          subscriptionExpiresAt: paidPayment.expiresAt,
          dailyDownloadLimit: SUBSCRIPTION_PLANS[paidPayment.plan].dailyDownloadLimit,
        },
      },
      { new: true }
    ).lean();

    if (!paidPayment.invoiceSentAt) {
      try {
        if (await sendInvoiceEmail(paidPayment, updatedUser || req.authenticatedUser)) {
          await subscriptionPayment.updateOne(
            { _id: paidPayment._id, invoiceSentAt: { $exists: false } },
            { $set: { invoiceSentAt: new Date() } }
          );
        }
      } catch (emailError) {
        console.error("Subscription confirmation email error:", emailError);
      }
    }

    return res.status(200).json({
      message: "Subscription activated.",
      user: updatedUser,
      payment: {
        plan: paidPayment.plan,
        amount: paidPayment.amount,
        currency: paidPayment.currency,
        orderId: paidPayment.orderId,
        paymentId: paidPayment.paymentId,
        invoiceNumber: paidPayment.invoiceNumber,
        expiresAt: paidPayment.expiresAt,
      },
    });
  } catch (error) {
    if (error.message.startsWith("Razorpay test credentials")) {
      return res.status(503).json({ message: "Test payments are not configured." });
    }
    console.error("Subscription verification error:", error);
    return res.status(500).json({ message: "Unable to verify subscription payment." });
  }
};

export const recordWatchHeartbeat = async (req, res) => {
  const { videoId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Video not found." });
  }

  try {
    const [user, watchedVideo] = await Promise.all([
      users.findById(req.authenticatedUser._id),
      video.findById(videoId).select("isPremium"),
    ]);
    if (!user || !watchedVideo) return res.status(404).json({ message: "Video not found." });

    const planId = getEffectivePlan(user);
    const plan = SUBSCRIPTION_PLANS[planId];
    const isPremiumVideo = Boolean(watchedVideo.isPremium);
    if (planId === "free" && !isPremiumVideo) return res.status(200).json(getUsage(user));

    const now = new Date();
    const dayStart = getUtcDayStart(now);
    const isToday = user.watchUsageDate?.getTime() === dayStart.getTime();
    const currentTotal = isToday ? user.watchSecondsUsedToday || 0 : 0;
    const currentPremium = isToday ? user.premiumWatchSecondsUsedToday || 0 : 0;
    const limit = planId === "free" ? plan.premiumWatchLimitSeconds : plan.watchLimitSeconds;
    const used = planId === "free" ? currentPremium : currentTotal;
    if (limit !== null && used >= limit) {
      return res.status(429).json({ message: "Your daily watch-time limit has been reached.", ...getUsage(user) });
    }

    const previousHeartbeat = user.lastWatchHeartbeatAt;
    const elapsed = previousHeartbeat && isToday
      ? Math.max(0, Math.min(30, Math.floor((now.getTime() - previousHeartbeat.getTime()) / 1000)))
      : 0;
    const credited = limit === null ? elapsed : Math.min(elapsed, limit - used);
    const filter = { _id: user._id };
    filter.watchUsageDate = user.watchUsageDate || { $exists: false };
    filter.lastWatchHeartbeatAt = previousHeartbeat || { $exists: false };

    const update = { $set: { watchUsageDate: dayStart, lastWatchHeartbeatAt: now } };
    if (isToday) {
      update.$inc = isPremiumVideo
        ? { premiumWatchSecondsUsedToday: credited, watchSecondsUsedToday: credited }
        : { watchSecondsUsedToday: credited };
    } else {
      update.$set.watchSecondsUsedToday = isPremiumVideo ? credited : 0;
      update.$set.premiumWatchSecondsUsedToday = isPremiumVideo ? credited : 0;
    }

    const updated = await users.findOneAndUpdate(filter, update, { new: true });
    if (!updated) return res.status(409).json({ message: "Watch-time state changed; retry." });
    return res.status(200).json(getUsage(updated));
  } catch (error) {
    console.error("Watch-time tracking error:", error);
    return res.status(500).json({ message: "Unable to update watch time." });
  }
};