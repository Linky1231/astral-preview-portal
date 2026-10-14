import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/social/api";

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const hasSession = !!data.session;
      setIsAuthenticated(hasSession);
      if (hasSession) {
        // Load profile
        import("@/lib/social/api").then(({ getMyProfile }) => {
          getMyProfile().then(p => {
            if (mounted) {
              setUser(p as Profile | null);
              setIsLoading(false);
            }
          }).catch(() => { if (mounted) setIsLoading(false); });
        });
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsAuthenticated(!!session);
      if (!session) {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (method: string, formData?: FormData) => {
    if (method === "email-otp" && formData) {
      const email = formData.get("email") as string;
      const code = formData.get("code") as string;
      if (code) {
        // OTP code verification - in local mode, this isn't needed
        // The user is already signed in from the email submission
        return;
      }
      // Send OTP - in local mode we simulate sending
      await supabase.auth.signInWithPassword({ email, password: "placeholder" });
    }
    if (method === "anonymous") {
      // Anonymous not supported in local mode
      throw new Error("Anonymous sign-in not available in local mode");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
