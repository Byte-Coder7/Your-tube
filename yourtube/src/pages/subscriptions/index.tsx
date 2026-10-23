import { useEffect, useState } from "react";
import Script from "next/script";
import { Check, Crown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface Plan {
  id: "free" | "bronze" | "silver" | "gold";
  name: string;
  amount: number;
  currency: string;
  dailyDownloadLimit: number | null;
}

interface RazorpayResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name?: string; email?: string };
  theme: { color: string };
  modal: { ondismiss: () => void };
  handler: (result: RazorpayResult) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: (event: any) => void) => void;
    };
  }
}

const benefits: Record<Plan["id"], string[]> = {
  free: ["Unlimited non-premium viewing", "60 minutes of premium viewing per day", "1 download per day", "Ads enabled"],
  bronze: ["120 minutes of total viewing per day", "Premium video access", "Up to 5 downloads per day", "Ads enabled"],
  silver: ["240 minutes of total viewing per day", "Premium video access", "Up to 10 downloads per day", "Ad-free viewing"],
  gold: ["Unlimited daily viewing", "Full premium video access", "Unlimited downloads", "Ad-free viewing"],
};

const planOrder: Plan["id"][] = ["free", "bronze", "silver", "gold"];

export default function SubscriptionsPage() {
  const { user, login } = useUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [busyPlan, setBusyPlan] = useState("");
  const [message, setMessage] = useState("");
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansRequest, setPlansRequest] = useState(0);

  useEffect(() => {
    let active = true;
    setPlansLoading(true);
    setMessage("");
    axiosInstance.get("/subscriptions/plans").then((response) => {
      const receivedPlans = response.data?.plans;
      if (!Array.isArray(receivedPlans) || planOrder.some((id) => !receivedPlans.some((plan) => plan.id === id))) {
        throw new Error("The subscription plans response is incomplete.");
      }
      if (active) setPlans(receivedPlans);
    }).catch(() => {
      if (active) {
        setPlans([]);
        setMessage("Subscription plans are temporarily unavailable. Check that the backend is running, then retry.");
      }
    }).finally(() => {
      if (active) setPlansLoading(false);
    });
    if (user) {
      axiosInstance.get("/subscriptions/status").then((response) => {
        if (!active) return;
        setCurrentPlan(response.data.plan);
        setExpiresAt(response.data.subscriptionExpiresAt);
      }).catch(() => undefined);
    } else {
      setCurrentPlan("free");
      setExpiresAt(null);
    }
    return () => {
      active = false;
    };
  }, [user, plansRequest]);

  const startCheckout = async (planId: Plan["id"]) => {
    if (!user) {
      setMessage("Sign in before upgrading your plan.");
      return;
    }
    if (!checkoutReady || !window.Razorpay) {
      setMessage("Razorpay checkout is still loading. Try again in a moment.");
      return;
    }

    setBusyPlan(planId);
    setMessage("");
    try {
      const { data: order } = await axiosInstance.post("/subscriptions/order", { plan: planId });
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "YourTube",
        description: `${order.name} monthly subscription`,
        order_id: order.orderId,
        prefill: { name: user.name, email: user.email },
        theme: { color: "#155e75" },
        modal: { ondismiss: () => setBusyPlan("") },
        handler: async (paymentResult) => {
          try {
            const { data } = await axiosInstance.post("/subscriptions/verify", paymentResult);
            if (data.user) login(data.user);
            setCurrentPlan(data.payment.plan);
            setExpiresAt(data.payment.expiresAt);
            setMessage(`${order.name} is active. Invoice ${data.payment.invoiceNumber} was emailed if SMTP is configured.`);
          } catch (error: any) {
            setMessage(error.response?.data?.message || "Payment succeeded, but subscription confirmation failed. Contact support with your Razorpay payment ID.");
          } finally {
            setBusyPlan("");
          }
        },
      });
      checkout.on("payment.failed", (failure) => {
        setBusyPlan("");
        setMessage(failure.error?.description || "Payment was not completed.");
      });
      checkout.open();
    } catch (error: any) {
      setBusyPlan("");
      setMessage(error.response?.data?.message || "Unable to start checkout.");
    }
  };

  const orderedPlans = planOrder.map((id) => plans.find((plan) => plan.id === id)).filter(Boolean) as Plan[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setCheckoutReady(true)}
        onError={() => setMessage("Razorpay checkout could not be loaded.")}
      />
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-800">YourTube membership</p>
            <h1 className="mt-2 text-3xl font-bold">Choose your plan</h1>
            <p className="mt-2 max-w-2xl text-slate-600">More viewing time, premium videos, and downloads. Paid plans renew manually every 30 days.</p>
          </div>
          <div className="text-sm text-slate-600">
            <p>Current plan: <strong className="capitalize text-slate-950">{currentPlan}</strong></p>
            {expiresAt && <p>Active through {new Date(expiresAt).toLocaleDateString()}</p>}
          </div>
        </div>

        {message && <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950" role="status">
          <span>{message}</span>
          {!plansLoading && plans.length === 0 && <Button variant="outline" size="sm" onClick={() => setPlansRequest((request) => request + 1)}>Retry plans</Button>}
        </div>}

        {plansLoading ? <p className="py-10 text-center text-slate-600" role="status">Loading subscription plans...</p> : plans.length > 0 ? <div className="grid gap-4 py-6 sm:grid-cols-2 xl:grid-cols-4">
          {orderedPlans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isPaid = plan.id !== "free";
            return (
              <section key={plan.id} className={`flex flex-col border bg-white p-5 ${plan.id === "gold" ? "border-amber-400" : "border-slate-200"}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">{plan.name}</h2>
                  {plan.id === "gold" ? <Crown className="h-5 w-5 text-amber-600" /> : <ShieldCheck className="h-5 w-5 text-cyan-800" />}
                </div>
                <p className="mt-5 text-3xl font-bold">
                  {isPaid ? `₹${(plan.amount / 100).toLocaleString("en-IN")}` : "Free"}
                  {isPaid && <span className="ml-1 text-sm font-normal text-slate-500">/ 30 days</span>}
                </p>
                <ul className="my-6 flex-1 space-y-3 text-sm text-slate-700">
                  {benefits[plan.id].map((benefit) => (
                    <li key={benefit} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-700" />{benefit}</li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.id === "gold" ? "default" : "outline"}
                  disabled={isCurrent || (isPaid && Boolean(busyPlan))}
                  onClick={() => isPaid && void startCheckout(plan.id)}
                >
                  {busyPlan === plan.id ? "Opening checkout..." : isCurrent ? "Current plan" : isPaid ? "Upgrade" : "Included"}
                </Button>
              </section>
            );
          })}
        </div> : null}

        <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          Payments use Razorpay test mode. Test credentials are required on the server. Plans are activated only after payment signature and captured status are verified.
        </p>
      </div>
    </main>
  );
}