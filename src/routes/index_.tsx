import { createFileRoute, redirect } from "@tanstack/react-router";

// La vista previa a veces abre «/index»: se redirige al inicio real.
export const Route = createFileRoute("/index_")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
