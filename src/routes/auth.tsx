import { createFileRoute, useSearch } from "@tanstack/react-router";
import { SignInSide } from "@/components/auth/SignInSide";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : "/",
  }),
  head: () => ({ meta: [{ title: "Asternal — Acceso a la plataforma" }] }),
  component: AuthPage,
});

/**
 * Pantalla de acceso.
 *
 * Es exactamente la misma pantalla que muestra la portada (`/`) cuando no hay
 * sesión, así que cualquier redirección a `/auth` (perfil, publicaciones,
 * tienda, crear, chat…) presenta el diseño «sign-in-side» en lugar de la
 * versión anterior. Al entrar se vuelve al destino pedido en `returnTo`.
 */
function AuthPage() {
  const { returnTo } = useSearch({ from: "/auth" });
  return <SignInSide returnTo={returnTo || "/"} />;
}
