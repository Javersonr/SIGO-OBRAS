import { useEffect } from "react";
import { safeParseJSON } from "@/lib/json-utils";
import { createPageUrl } from "../utils";

export default function Index() {
  useEffect(() => {
    try {
      const customAuth = sessionStorage.getItem("custom_auth");
      const userData = customAuth ? safeParseJSON(customAuth, null) : null;
      if (userData?.id && userData?.email && userData?.empresa_id) {
        window.location.href = createPageUrl("Dashboard");
      } else {
        sessionStorage.clear();
        window.location.href = createPageUrl("EntrarSistema");
      }
    } catch {
      sessionStorage.clear();
      window.location.href = createPageUrl("EntrarSistema");
    }
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#0f172a" }}
    >
      <div
        className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: "#334155", borderTopColor: "transparent" }}
      />
    </div>
  );
}
