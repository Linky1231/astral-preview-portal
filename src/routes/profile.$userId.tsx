import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth", search: { returnTo: `/profile/${userId}` } }); return; }
      setMyId(session.user.id);
      setMod(await checkMod());
    })();
  }, [navigate]);

  if (!myId) return null;
  const viewingOwn = myId === userId;
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <SubPageHeader
        title={viewingOwn ? "MI PERFIL" : "PERFIL"}
        subtitle={`@${userId.slice(0, 10)}…`}
      />
      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-3 py-3 pb-24">
        <ProfilePanel key={userId} userId={userId} myId={myId} isMod={mod} viewingOwn={viewingOwn} />
      </main>
    </div>
  );
}
