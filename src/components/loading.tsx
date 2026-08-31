import { Ecg } from "@/components/ui";

/**
 * What a page looks like while it is still arriving.
 *
 * Next.js streams a route's `loading.tsx` the moment a navigation starts, so
 * this is the difference between "the tab froze" and "it is coming". Every
 * skeleton mirrors the shape of the page it stands in for — cards where cards
 * will be, a table where a table will be — because a skeleton that does not
 * match causes a visible jump when the real content lands, which reads as a
 * second, worse kind of glitch.
 *
 * Nothing here spins forever in the corner: the heartbeat traces along the top
 * where the eye already is, and the blocks breathe rather than flash.
 */

export function SkeletonLine({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return <span className="hs-skeleton" style={{ width: w, height: h }} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="hs-card space-y-3 p-5">
      <SkeletonLine w="45%" h={14} />
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLine key={index} w={index === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-3">
      <span className="hs-skeleton hs-skeleton-circle" style={{ width: 34, height: 34 }} />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonLine w="55%" />
        <SkeletonLine w="30%" h={9} />
      </div>
      <SkeletonLine w="72px" h={20} />
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="hs-card space-y-2 p-4">
          <SkeletonLine w="60%" h={9} />
          <SkeletonLine w="40%" h={22} />
        </div>
      ))}
    </div>
  );
}

/**
 * The banner every loading state opens with.
 *
 * `role="status"` with `aria-live="polite"` means a screen reader says
 * "Loading" once rather than reading a screenful of empty boxes.
 */
export function LoadingHeader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="hs-loading-header" role="status" aria-live="polite">
      <Ecg className="w-20 text-brand/60" animate />
      <span className="text-sm font-semibold text-brand-deep">{label}…</span>
    </div>
  );
}

/** The default page skeleton: a header, some stats, a couple of cards. */
export function PageSkeleton({
  label,
  stats = true,
  cards = 2,
  rows = 0,
}: {
  label?: string;
  stats?: boolean;
  cards?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <LoadingHeader label={label} />

      <div className="space-y-2">
        <SkeletonLine w="90px" h={10} />
        <SkeletonLine w="260px" h={26} />
      </div>

      {stats ? <SkeletonStats /> : null}

      {rows > 0 ? (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, index) => (
            <SkeletonRow key={index} />
          ))}
        </div>
      ) : null}

      {cards > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: cards }).map((_, index) => (
            <div key={index} className={index === 0 && cards > 1 ? "lg:col-span-2" : ""}>
              <SkeletonCard lines={index === 0 ? 4 : 2} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
