import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { HistorySection } from "@/components/social/HistorySection";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Historial · Asternal" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <SubPageHeader
        title="MI HISTORIAL"
        icon={<BarChart3 size={15} />}
        subtitle="Tu actividad reciente en Asternal"
      />
      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-3 py-3 pb-24">
        <HistorySection />
      </main>
    </div>
  );
}
