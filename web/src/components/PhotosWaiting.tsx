import { Link } from "react-router-dom";
import { useScanStore } from "@/lib/store/scanStore";
import { Banner } from "./Feedback";

/**
 * Shown while earlier photos of a wrapped-round list wait for the next one,
 * so a half-finished multi-photo scan is never invisible.
 */
export function PhotosWaiting({ onCamera = false }: { onCamera?: boolean }) {
  const count = useScanStore((s) => s.earlierPhotos.length);
  const clear = useScanStore((s) => s.clearEarlierPhotos);
  if (count === 0) return null;
  const photos = `${count} photo${count === 1 ? "" : "s"}`;
  if (onCamera) {
    return (
      <Banner
        kind="info"
        title={`${photos} of this list read.`}
        actions={
          <button type="button" className="es-link" onClick={clear}>
            Start over
          </button>
        }
      >
        Take the next part, overlapping the last photo a little.
      </Banner>
    );
  }
  return (
    <Banner
      kind="info"
      title={`You have a scan in progress: ${photos}.`}
      actions={
        <>
          <Link className="es-link" to="/camera">
            Continue
          </Link>
          <button type="button" className="es-link" onClick={clear}>
            Discard
          </button>
        </>
      }
    />
  );
}
