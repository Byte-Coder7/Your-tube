import { FormEvent, useEffect, useState } from "react";
import { useUser } from "@/lib/AuthContext";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export default function OtpVerificationDialog() {
  const { pendingVerification, verifyOtp, resendOtp } = useUser();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendWait, setResendWait] = useState(60);

  useEffect(() => {
    setCode("");
    setMessage("");
    setResendWait(60);
  }, [pendingVerification?.challengeId]);

  useEffect(() => {
    if (!pendingVerification || resendWait <= 0) return;
    const timer = window.setTimeout(() => setResendWait((remaining) => remaining - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [pendingVerification, resendWait]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter all six digits.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await verifyOtp(code);
    } catch (error: any) {
      setMessage(error.response?.data?.message || error.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await resendOtp();
      setResendWait(60);
      setMessage(result);
    } catch (error: any) {
      setMessage(error.response?.data?.message || error.message || "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(pendingVerification)} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Verify this sign-in</DialogTitle>
          <DialogDescription>
            Enter the six-digit code sent to {pendingVerification?.email}. It expires in five minutes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            aria-label="Six-digit verification code"
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={busy}
            required
          />
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" disabled={busy || resendWait > 0} onClick={handleResend}>
              {resendWait > 0 ? `Resend in ${resendWait}s` : "Resend code"}
            </Button>
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Checking..." : "Verify"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}