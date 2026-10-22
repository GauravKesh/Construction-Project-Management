"use client";

import { useEffect, useState } from "react";

/** Wall-clock time rendered only on the client, so server and client HTML match. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return <>{now ? now.toLocaleTimeString() : ""}</>;
}
