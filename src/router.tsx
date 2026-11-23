import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Sur GitHub Pages l'application est servie sous /CRI-BLO-/ ; l'APK reste à la racine.
  const basepath = (import.meta.env.VITE_ROUTER_BASE as string | undefined) || undefined;

  const router = createRouter({
    routeTree,
    basepath,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
