export const SUBSCRIPTION_PLANS = {
  free: {
    name: "Free",
    amount: 0,
    currency: "INR",
    durationDays: 0,
    watchLimitSeconds: null,
    premiumWatchLimitSeconds: 60 * 60,
    dailyDownloadLimit: 1,
    premiumVideos: true,
    ads: true,
  },
  bronze: {
    name: "Bronze",
    amount: 9900,
    currency: "INR",
    durationDays: 30,
    watchLimitSeconds: 120 * 60,
    premiumWatchLimitSeconds: null,
    dailyDownloadLimit: 5,
    premiumVideos: true,
    ads: true,
  },
  silver: {
    name: "Silver",
    amount: 19900,
    currency: "INR",
    durationDays: 30,
    watchLimitSeconds: 240 * 60,
    premiumWatchLimitSeconds: null,
    dailyDownloadLimit: 10,
    premiumVideos: true,
    ads: false,
  },
  gold: {
    name: "Gold",
    amount: 39900,
    currency: "INR",
    durationDays: 30,
    watchLimitSeconds: null,
    premiumWatchLimitSeconds: null,
    dailyDownloadLimit: null,
    premiumVideos: true,
    ads: false,
  },
};

export const getEffectivePlan = (user, now = new Date()) => {
  if (user.plan === "premium") return "gold";
  if (user.plan === "free") return "free";
  if (
    !SUBSCRIPTION_PLANS[user.plan] ||
    user.plan === "free" ||
    (user.subscriptionExpiresAt && user.subscriptionExpiresAt <= now)
  ) {
    return "free";
  }
  return user.plan;
};