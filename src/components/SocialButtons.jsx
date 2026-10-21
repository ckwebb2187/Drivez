import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, base44 } from "@/api/base44Client";

export function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
    </svg>
  );
}

export function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
    </svg>
  );
}

export function DiscordIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    </svg>
  );
}

const PROVIDERS = {
  google: { label: "Continue with Google", Icon: GoogleIcon, cls: "" },
  discord: { label: "Continue with Discord", Icon: DiscordIcon, cls: "text-[#5865F2]" },
  facebook: { label: "Continue with Facebook", Icon: FacebookIcon, cls: "text-[#1877F2]" },
};

let cached = null;
export function useAuthConfig() {
  const [cfg, setCfg] = useState(cached);
  useEffect(() => {
    if (cached) return;
    api.get("/auth/config").then((c) => { cached = c; setCfg(c); }).catch(() => setCfg({ providers: [] }));
  }, []);
  return cfg;
}

// Shows a button for each sign-in service that has been set up on the server.
export default function SocialButtons() {
  const cfg = useAuthConfig();
  const list = (cfg?.providers || []).filter((p) => PROVIDERS[p]);
  if (!list.length) return null;
  return (
    <>
      {list.map((p) => {
        const { label, Icon, cls } = PROVIDERS[p];
        return (
          <Button key={p} variant="outline" className="w-full h-12 text-sm font-medium mb-3" onClick={() => base44.auth.loginWithProvider(p, "/")}>
            <Icon className={`w-5 h-5 mr-2 ${cls}`} />
            {label}
          </Button>
        );
      })}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>
    </>
  );
}
