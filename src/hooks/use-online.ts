import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

export function useOnline(): boolean {
  // Start online to keep the initial render stable, then synchronize with the
  // real browser/native network state immediately after mount.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let removeNativeListener: (() => Promise<void>) | undefined;

    const browserOnline = () => setOnline(true);
    const browserOffline = () => setOnline(false);

    if (Capacitor.isNativePlatform()) {
      void (async () => {
        try {
          const status = await Network.getStatus();
          if (!cancelled) setOnline(status.connected);
          const handle = await Network.addListener("networkStatusChange", (next) => {
            if (!cancelled) setOnline(next.connected);
          });
          if (cancelled) {
            await handle.remove();
          } else {
            removeNativeListener = () => handle.remove();
          }
        } catch {
          if (!cancelled && typeof navigator !== "undefined") setOnline(navigator.onLine);
        }
      })();
    } else {
      if (typeof navigator !== "undefined") setOnline(navigator.onLine);
      window.addEventListener("online", browserOnline);
      window.addEventListener("offline", browserOffline);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("online", browserOnline);
      window.removeEventListener("offline", browserOffline);
      if (removeNativeListener) void removeNativeListener();
    };
  }, []);

  return online;
}
