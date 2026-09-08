import { qrMatrix } from "@/lib/qr";

/**
 * A scannable code for a link, rendered inline as SVG.
 *
 * Server-rendered on purpose: no canvas, no client bundle, no image request,
 * and nothing for the Content-Security-Policy to make an exception for. It
 * prints at whatever size the paper is, because it is vector all the way down.
 */
export function QrCode({
  value,
  size = 176,
  title,
  className = "",
}: {
  value: string;
  size?: number;
  title?: string;
  className?: string;
}) {
  const matrix = qrMatrix(value);
  if (!matrix) return null;

  return (
    <svg
      viewBox={`0 0 ${matrix.size} ${matrix.size}`}
      width={size}
      height={size}
      role="img"
      aria-label={title ?? `QR code for ${value}`}
      // A QR scanner reads contrast, not colour. The white ground is painted
      // here rather than inherited so the code stays readable on a dark card
      // and on a page somebody printed in a hurry.
      className={`shrink-0 rounded-lg bg-white text-black ${className}`}
      shapeRendering="crispEdges"
    >
      {/* The quiet zone is part of the code. Without it a scanner sitting on a
          patterned background often will not lock on at all. */}
      <rect x="0" y="0" width={matrix.size} height={matrix.size} fill="#ffffff" rx="1" />
      <path d={matrix.path} fill="currentColor" />
    </svg>
  );
}
