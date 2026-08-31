"use client";

import { useEffect, useState } from "react";
import { Ecg } from "@/components/ui";

/**
 * Countdown to 20 March 2027. It sits on every dashboard because it creates
 * useful pressure.
 *
 * Rendered from a server-supplied ISO string and only started after mount, so
 * server and client markup agree on the first paint.
 */
export function Countdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = now === null ? null : Math.max(0, target - now);

  const parts =
    diff === null
      ? null
      : {
          days: Math.floor(diff / 86_400_000),
          hours: Math.floor((diff % 86_400_000) / 3_600_000),
          minutes: Math.floor((diff % 3_600_000) / 60_000),
          seconds: Math.floor((diff % 60_000) / 1000),
        };

  return (
    <div className="hs-card overflow-hidden bg-gradient-to-br from-pink-600 to-pink-700 p-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-white">
            Countdown to event
          </p>
          <p className="mt-0.5 text-sm font-medium text-white">20–21 March 2027</p>
        </div>
        <Ecg className="w-20 text-pink-200/80" />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["Days", parts?.days],
            ["Hours", parts?.hours],
            ["Min", parts?.minutes],
            ["Sec", parts?.seconds],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-black/15 py-2.5">
            <p className="text-xl font-extrabold tabular-nums">
              {value === undefined || value === null ? "—" : String(value).padStart(2, "0")}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
