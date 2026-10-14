import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { ProfilePanel } from "@/components/social/ProfilePanel";
import { isMod as checkMod } from "@/lib/social/api";

export const Route = createFileRoute("/profile/$userId")({
  head: () => ({ meta: [{ title: "Perfil · Asternal" }] }),
  component: ProfileByIdPage,
});

function ProfileByIdPage() {
  const navigate = useNavigate();
  const { userId } = useParams({ from: "/profile/$userId" });
  const [myId, setMyId] = useState<string | null>(null);
  const [mod, setMod] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth", search: { returnTo: `/profile/${userId}` } }); return; }
      setMyId(session.user.id);
      setMod(await checkMod());
    })();
  }, [navigate]);

  if (!myId) return <div className="min-h-dvh bg-background text-foreground"><SubPageHeader title="PERFIL" /><div role="status" className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline animate-spin" size={16} />Cargando perfil…</div></div>;
  const viewingOwn = myId === userId;
  return (
    <div className="min-h-dvh w-full min-w-0 flex flex-col bg-background text-foreground">
      <SubPageHeader
        title={viewingOwn ? "MI PERFIL" : "PERFIL"}
        subtitle={handle ? `@${handle}` : undefined}
      />
      <main className="min-w-0 flex-1 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-3 py-3 pb-6">
        <ProfilePanel key={userId} userId={userId} myId={myId} isMod={mod} viewingOwn={viewingOwn} onProfileChange={p => setHandle(p.username ?? null)} />
      </main>
    </div>
  );
}
