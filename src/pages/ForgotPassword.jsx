import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Mail, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { useAuthConfig } from "@/components/SocialButtons";

export default function ForgotPassword() {
  const cfg = useAuthConfig();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one"
      footer={<Link to="/login" className="text-primary font-medium hover:underline">Back to log in</Link>}
    >
      {cfg && !cfg.emailReset ? (
        <p className="text-sm text-muted-foreground">
          Password reset emails aren't set up yet. If you signed up with Google, Discord or Facebook, use that button to log in instead.
        </p>
      ) : sent ? (
        <p className="text-sm text-foreground">If an account exists for <b>{email}</b>, a reset link is on its way. Check your inbox (and spam folder).</p>
      ) : (
        <>
          {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
