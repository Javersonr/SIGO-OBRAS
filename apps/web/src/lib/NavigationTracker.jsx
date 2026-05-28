import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { sigo } from "@/api/sigoClient";
import { pagesConfig } from "@/pages.config";

/**
 * Loga a página visitada em background (fire-and-forget).
 * "Autenticado" = sessionStorage.custom_auth tem id+empresa_id válidos.
 */
function isAuthenticated() {
  try {
    const raw = sessionStorage.getItem("custom_auth");
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Boolean(data?.id && data?.empresa_id);
  } catch {
    return false;
  }
}

export default function NavigationTracker() {
  const location = useLocation();
  const { Pages, mainPage } = pagesConfig;
  const mainPageKey = mainPage ?? Object.keys(Pages)[0];

  useEffect(() => {
    const pathname = location.pathname;
    let pageName;

    if (pathname === "/" || pathname === "") {
      pageName = mainPageKey;
    } else {
      const pathSegment = pathname.replace(/^\//, "").split("/")[0];
      const pageKeys = Object.keys(Pages);
      pageName = pageKeys.find((key) => key.toLowerCase() === pathSegment.toLowerCase()) || null;
    }

    if (isAuthenticated() && pageName && sigo?.appLogs?.logUserInApp) {
      sigo.appLogs.logUserInApp(pageName).catch(() => {
        // logging silencioso por design — nunca quebrar UX por causa de telemetria
      });
    }
  }, [location, Pages, mainPageKey]);

  return null;
}
