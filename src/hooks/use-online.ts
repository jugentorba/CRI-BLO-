import { useEffect, useState } from "react";

export function useOnline(): boolean {
  // Always start as `true` to match SSR output, then sync with the real value
  // after mount. Reading `navigator.onLine` during render causes a hydration
  // mismatch when the device is offline at first paint.
  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
