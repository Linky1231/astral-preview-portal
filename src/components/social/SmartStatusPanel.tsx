import { useEffect, useState } from "react";
import {
  Shield,
  Users,
  Gamepad2,
  MessageCircle,
  Bell,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { generateSmartStatus, type SmartStatus } from "@/lib/social/smart-status";
import { getTrustPoints, getFollowStats } from "@/lib/social/api";
import { supabase } from "@/integrations/supabase/client";

const SEVERITY_CONFIG = {
  normal: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200/50",
    dot: "bg-emerald-500",
  },
  attention: {
    icon: AlertCircle,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200/50",
    dot: "bg-amber-500",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-50",
    border: "border-orange-200/50",
    dot: "bg-orange-500",
  },
  urgent: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-200/50",
    dot: "bg-red-500",
  },
};

const AREA_ICONS: Record<string, typeof Shield> = {
  cuenta: Shield,
  desarrollo: Gamepad2,
  comunidad: Users,
  sistema: Shield,
};

export function SmartStatusPanel({ userId }: { userId: string }) {
  const [status, setStatus] = useState<SmartStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Gather data in parallel
        const [trustPoints, followStats] = await Promise.all([
          getTrustPoints(userId).catch(() => 10),
          getFollowStats(userId).catch(() => ({ followers: 0, following: 0, i_follow: false })),
        ]);

        // Get user profile data
        const { data: profile } = await supabase
          .from("profiles")
          .select("created_at")
          .eq("id", userId)
          .maybeSingle();

        // Count games and posts
        let gamesResult = 0;
        let postsResult = 0;
        try {
          const gr = await (supabase as any).from("games").select("id").eq("author", userId);
          gamesResult = Array.isArray(gr.data) ? gr.data.length : 0;
        } catch { /* noop */ }
        try {
          const pr = await (supabase as any).from("posts").select("id").eq("author_id", userId);
          postsResult = Array.isArray(pr.data) ? pr.data.length : 0;
        } catch { /* noop */ }

        // Get orbes
        const { data: orbProfile } = await supabase
          .from("profiles")
          .select("orbes")
          .eq("id", userId)
          .maybeSingle();

        // Calculate days since last login (approximate via updated_at)
        const lastLoginDays = profile?.created_at
          ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const accountAgeDays = profile?.created_at
          ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        // Get notification count
        let notifCount = 0;
        try {
          const nr = await (supabase as any)
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("read", false);
          notifCount = Array.isArray(nr.data) ? nr.data.length : 0;
        } catch { /* noop */ }

        if (!cancelled) {
          const result = generateSmartStatus({
            trustPoints,
            followers: followStats.followers,
            following: followStats.following,
            gamesCount: gamesResult,
            postsCount: postsResult,
            notificationsUnread: notifCount,
            orbes: (orbProfile as Record<string, unknown>)?.orbes as number ?? 0,
            lastLoginDays,
            accountAgeDays,
            isMod: false,
            isAdmin: false,
          });
          setStatus(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setStatus({
            severity: "normal",
            title: "Todo funciona correctamente",
            message: "Tu cuenta está en buen estado.",
            area: "sistema",
          });
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading || !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
        <Clock size={12} className="animate-pulse" />
        Analizando estado de cuenta…
      </div>
    );
  }

  const config = SEVERITY_CONFIG[status.severity];
  const Icon = config.icon;
  const AreaIcon = AREA_ICONS[status.area] ?? Shield;

  return (
    <div className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${config.border} ${config.bg}`}>
      <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${config.bg}`}>
        <Icon size={16} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <span className="text-[11px] font-display font-semibold text-foreground">
            {status.title}
          </span>
        </div>
        <p className="text-[11px] text-foreground/55 mt-0.5 leading-relaxed">
          {status.message}
        </p>
        <div className="flex items-center gap-1 mt-1.5">
          <AreaIcon size={9} className="text-muted-foreground/30" />
          <span className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-wider">
            {status.area}
          </span>
        </div>
      </div>
    </div>
  );
}
