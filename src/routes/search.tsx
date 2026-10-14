import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { SubPageHeader } from "@/components/social/SubPageHeader";
import { SearchSection } from "@/components/social/SearchSection";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Buscar · Asternal" }] }),
  component: SearchPage,
});

function SearchPage() {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <SubPageHeader
        title="BUSCAR"
        icon={<Search size={15} />}
        subtitle="Busca en toda la aplicación"
      />
      <main className="flex-1 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-3 py-3 pb-24">
        <SearchSection />
      </main>
    </div>
  );
}
