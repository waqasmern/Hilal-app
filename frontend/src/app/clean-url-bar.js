"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Strips Next.js internal ?_rsc=... from the address bar (cosmetic only).
 */
export default function CleanUrlBar() {
  const pathname = usePathname();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_rsc")) return;
    url.searchParams.delete("_rsc");
    const search = url.searchParams.toString();
    const clean = search ? `${url.pathname}?${search}` : url.pathname;
    window.history.replaceState(window.history.state, "", clean);
  }, [pathname]);

  return null;
}
