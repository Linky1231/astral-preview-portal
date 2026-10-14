import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { recordVisit } from "@/lib/nav-history";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Historial local temporal: cada pantalla queda registrada para que el
  // botón «Volver» sepa a qué posición devolverse.
  const syncLocalHistory = () => {
    const href = router.history.location?.href || router.state.location?.href || "/";
    recordVisit(href);
  };
  syncLocalHistory();
  router.history.subscribe(syncLocalHistory);

  return router;
};
