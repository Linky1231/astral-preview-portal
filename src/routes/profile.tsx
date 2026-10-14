import { createFileRoute, useNavigate, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { ProfilePanel } from "@/components/social/ProfilePanel";
import { isMod as checkMod, getMyProfile, type Profile } from "@/lib/social/api";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Mi perfil · Asternal" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  // Ruta hija (/profile/<id>): se renderiza el perfil de ESE usuario, no el nuestro.
  const otherMatch = useMatch({ from: "/profile/$userId", shouldThrow: false });
  const [myId, setMyId] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [mod, setMod] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth", search: { returnTo: "/profile" } }); return; }
      setMyId(session.user.id);
      setMe(await getMyProfile());
      setMod(await checkMod());
    })();
  }, [navigate]);

  // Si la URL es /profile/<id>, el contenido real vive en la ruta hija
  // (profile.$userId) que el router monta en este Outlet.
  if (otherMatch) return <Outlet />;

  if (!myId) return null;
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <SubPageHeader
        title="MI PERFIL"
        subtitle={me ? `@${me.username ?? "…"}` : undefined}
        right={
          me?.show_orbes !== false ? (
            <div title="Orbes" className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary/10 text-primary border border-primary/15 select-none">
              <Sparkles size={14} className="text-primary" fill="currentColor" />
              <span className="text-xs font-display font-semibold tabular-nums">{me?.orbes ?? 0}</span>
            </div>
          ) : undefined
        }
      />
      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-3 py-3 pb-24">
        <ProfilePanel userId={myId} myId={myId} isMod={mod} viewingOwn={true} />
      </main>
    </div>
  );
}
