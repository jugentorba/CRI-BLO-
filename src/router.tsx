import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function getRouterBasepath() {
  if (typeof window === "undefined") return "/";

  // GitHub project Pages sites are hosted under /<repository-name>/.
  // Detect the first path segment instead of hard-coding the repository name,
  // so the PWA keeps working if the repository is renamed (for example CRIBLO).
  if (window.location.hostname.toLowerCase().endsWith(".github.io")) {
    const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
    return firstSegment ? `/${firstSegment}` : "/";
  }

  return "/";
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    basepath: getRouterBasepath(),
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
