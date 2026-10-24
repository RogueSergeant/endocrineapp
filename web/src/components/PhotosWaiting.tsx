import { useScanStore } from "@/lib/store/scanStore";

/**
 * Shown while earlier photos of a wrapped-round list wait for the next one,
 * so a half-finished multi-photo scan is never invisible.
 */
export function PhotosWaiting({ className }: { className?: string }) {
  const count = useScanStore((s) => s.earlierPhotos.length);
  const clear = useScanStore((s) => s.clearEarlierPhotos);
  if (count === 0) return null;
  return (
    <div className={`photos-waiting ${className ?? ""}`} role="status">
      {count} photo{count === 1 ? "" : "s"} of this list read. Take the next part, overlapping the
      last photo a little.{" "}
      <button type="button" className="link-btn" onClick={clear}>
        Start over
      </button>
    </div>
  );
}
