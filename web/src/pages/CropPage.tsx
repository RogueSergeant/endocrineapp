import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Banner } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { Layout } from "@/components/Layout";
import { DownloadProgress } from "@/pages/ScanPage";
import { flattenedSize, isConvex, warpQuad, type Point, type Quad } from "@/lib/perspective";
import { useOcrStatus } from "@/lib/ocr/textRecognition";
import { addPhotoOfList, scanImage, TooFewIngredientsError } from "@/lib/scan";
import { useScanStore } from "@/lib/store/scanStore";

// The on-screen preview. Phone photos are 12-48 MP, and a full-size copy
// kept for dragging over adds memory pressure (iOS Safari kills tabs that
// use too much); the selection itself is cut from the full photo.
const MAX_SIDE = 2000;
// The most detail kept for the selected region. The recogniser reads line
// crops at up to 2000px, so more costs memory without helping.
const MAX_REGION_SIDE = 2400;
// Shortest side, in screen pixels, a drag may leave the selection with:
// just enough to keep two corners from landing on top of each other.
const MIN_RECT_PX = 12;
const MIN_CROP_PX = 16;

// The selection is four independent corners (top-left, top-right,
// bottom-right, bottom-left) in normalised image coordinates (0-1), so it
// can follow a label photographed at an angle; the scan flattens it.

/** Drag the whole selection, or the corner at this index. */
type DragMode = "move" | 0 | 1 | 2 | 3;

interface Drag {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  start: Quad;
}

// Initial selection: middle 90% x 35% of the image.
const INITIAL_CORNERS: Quad = [
  { x: 0.05, y: 0.325 },
  { x: 0.95, y: 0.325 },
  { x: 0.95, y: 0.675 },
  { x: 0.05, y: 0.675 },
];

// Magnifier shown above a corner while it is dragged, since the finger
// covers the very spot being lined up: its size, magnification, and how
// far it sits from the corner (clear of a fingertip).
const LOUPE = 112;
const LOUPE_ZOOM = 3;
const LOUPE_GAP = 70;

const shift = (q: Quad, dx: number, dy: number): Quad =>
  q.map((p) => ({ x: p.x + dx, y: p.y + dy })) as unknown as Quad;

/**
 * The selection with one corner moved by (dx, dy), or null for a shape that
 * folds over itself or has a side too short to grab.
 */
function movedCorner(
  q: Quad,
  i: 0 | 1 | 2 | 3,
  dx: number,
  dy: number,
  fit: { w: number; h: number },
): Quad | null {
  const moved: Point = { x: clamp(q[i].x + dx, 0, 1), y: clamp(q[i].y + dy, 0, 1) };
  const next = q.map((p, j) => (j === i ? moved : p)) as unknown as Quad;
  const onScreen = next.map((p) => ({ x: p.x * fit.w, y: p.y * fit.h }));
  const shortest = Math.min(
    ...onScreen.map((p, j) => {
      const r = onScreen[(j + 1) % 4]!;
      return Math.hypot(p.x - r.x, p.y - r.y);
    }),
  );
  return isConvex(next) && shortest >= MIN_RECT_PX ? next : null;
}

async function decodeImage(blob: Blob): Promise<HTMLCanvasElement> {
  // createImageBitmap applies EXIF orientation by default in current
  // browsers, so portrait phone photos arrive the right way up.
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function containedRect(imgW: number, imgH: number, boxW: number, boxH: number) {
  const imgAR = imgW / imgH;
  if (imgAR > boxW / boxH) {
    const h = boxW / imgAR;
    return { x: 0, y: (boxH - h) / 2, w: boxW, h };
  }
  const w = boxH * imgAR;
  return { x: (boxW - w) / 2, y: 0, w, h: boxH };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The selected region as an upright rectangle: its four corners mapped
 * onto a rectangle's, which undoes both tilt and the keystone of a photo
 * taken at an angle. Reads only the pixels around the selection.
 */
/**
 * The selected region flattened from the full-resolution photo rather than
 * the preview: a small list in a photo taken from arm's length has letters
 * only a few pixels high at preview size, half what the OCR gets here.
 * Only the region is copied out, capped at MAX_REGION_SIDE.
 */
async function flattenFromPhoto(photo: Blob, corners: Quad): Promise<ImageData> {
  const full = await createImageBitmap(photo);
  try {
    const W = full.width;
    const H = full.height;
    const inPx = corners.map((p) => ({ x: p.x * W, y: p.y * H }));
    const left = clamp(Math.floor(Math.min(...inPx.map((p) => p.x))), 0, W - 1);
    const top = clamp(Math.floor(Math.min(...inPx.map((p) => p.y))), 0, H - 1);
    const right = clamp(Math.ceil(Math.max(...inPx.map((p) => p.x))), left + 1, W);
    const bottom = clamp(Math.ceil(Math.max(...inPx.map((p) => p.y))), top + 1, H);
    const scale = Math.min(1, MAX_REGION_SIDE / Math.max(right - left, bottom - top));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((right - left) * scale));
    canvas.height = Math.max(1, Math.round((bottom - top) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(full, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
    const region = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const quad = inPx.map((p) => ({
      x: (p.x - left) * scale,
      y: (p.y - top) * scale,
    })) as unknown as Quad;
    const size = flattenedSize(quad);
    const out = warpQuad(
      region,
      quad,
      Math.max(MIN_CROP_PX, size.width),
      Math.max(MIN_CROP_PX, size.height),
    );
    return new ImageData(out.data, out.width, out.height);
  } finally {
    full.close();
  }
}

/** The same from the preview, if the full photo can't be decoded again. */
function flatten(source: HTMLCanvasElement, corners: Quad): ImageData {
  const W = source.width;
  const H = source.height;
  const inPx = corners.map((p) => ({ x: p.x * W, y: p.y * H }));
  const left = clamp(Math.floor(Math.min(...inPx.map((p) => p.x))), 0, W - 1);
  const top = clamp(Math.floor(Math.min(...inPx.map((p) => p.y))), 0, H - 1);
  const right = clamp(Math.ceil(Math.max(...inPx.map((p) => p.x))), left + 1, W);
  const bottom = clamp(Math.ceil(Math.max(...inPx.map((p) => p.y))), top + 1, H);
  const ctx = source.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const region = ctx.getImageData(left, top, right - left, bottom - top);
  const quad = inPx.map((p) => ({ x: p.x - left, y: p.y - top })) as unknown as Quad;
  const size = flattenedSize(quad);
  const out = warpQuad(
    region,
    quad,
    Math.max(MIN_CROP_PX, size.width),
    Math.max(MIN_CROP_PX, size.height),
  );
  return new ImageData(out.data, out.width, out.height);
}

export function CropPage() {
  const navigate = useNavigate();
  // Photos from the in-app camera retake there; others go back to the start.
  const retakeTo = (useLocation().state as { retake?: string } | null)?.retake ?? "/";
  const pendingImage = useScanStore((s) => s.pendingImage);
  const ocr = useOcrStatus();
  const stageRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<Quad>(INITIAL_CORNERS);
  const [busy, setBusy] = useState(false);
  // The corner being dragged, for the magnifier.
  const [activeCorner, setActiveCorner] = useState<0 | 1 | 2 | 3 | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const running = useRef(false);
  // Set while the current photo is being read as one part of several.
  const adding = useRef(false);
  const earlier = useScanStore((s) => s.earlierPhotos.length);
  // Aborted when the page unmounts, so a scan the user walked away from
  // can't save, replace the current scan or navigate them back.
  const unmounted = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!pendingImage) return;
    let cancelled = false;
    let url: string | null = null;
    decodeImage(pendingImage).then(
      (canvas) => {
        if (cancelled) return;
        setSource(canvas);
        canvas.toBlob(
          (b) => {
            if (cancelled || !b) return;
            url = URL.createObjectURL(b);
            setPreviewUrl(url);
          },
          "image/jpeg",
          0.85,
        );
      },
      () => {
        if (!cancelled) {
          setError({ title: "That photo couldn't be opened.", body: "Try another photo." });
        }
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pendingImage]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit =
    source && stage.w > 0 && stage.h > 0
      ? containedRect(source.width, source.height, stage.w, stage.h)
      : null;

  const onPointerDown = (mode: DragMode) => (e: ReactPointerEvent<Element>) => {
    if (busy) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      start: corners,
    };
    setActiveCorner(mode === "move" ? null : mode);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !fit) return;
    const dx = (e.clientX - d.startX) / fit.w;
    const dy = (e.clientY - d.startY) / fit.h;
    const s = d.start;
    if (d.mode === "move") {
      // Keep every corner on the photo.
      const xs = s.map((p) => p.x);
      const ys = s.map((p) => p.y);
      setCorners(
        shift(
          s,
          clamp(dx, -Math.min(...xs), 1 - Math.max(...xs)),
          clamp(dy, -Math.min(...ys), 1 - Math.max(...ys)),
        ),
      );
      return;
    }
    const next = movedCorner(s, d.mode, dx, dy, fit);
    if (next) setCorners(next);
  };

  // Arrow keys move a focused corner: 1% a press, 5% with Shift.
  const onHandleKey = (i: 0 | 1 | 2 | 3) => (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = dir[e.key];
    if (!d || busy || !fit) return;
    e.preventDefault();
    const next = movedCorner(corners, i, d[0], d[1], fit);
    if (next) setCorners(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null;
      setActiveCorner(null);
    }
  };

  // Tapping outside the selection re-centres it on the tap.
  const onStageTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || !fit || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    const px = (e.clientX - box.left - fit.x) / fit.w;
    const py = (e.clientY - box.top - fit.y) / fit.h;
    setCorners((q) => {
      const xs = q.map((p) => p.x);
      const ys = q.map((p) => p.y);
      const cx = xs.reduce((a, b) => a + b) / 4;
      const cy = ys.reduce((a, b) => a + b) / 4;
      return shift(
        q,
        clamp(px - cx, -Math.min(...xs), 1 - Math.max(...xs)),
        clamp(py - cy, -Math.min(...ys), 1 - Math.max(...ys)),
      );
    });
  };

  const runScan = useCallback(async () => {
    // Ref guard (not just `busy`): a quick double tap can get past the
    // state check before React re-renders.
    const controller = unmounted.current;
    if (running.current || !source || !controller) return;
    const { signal } = controller;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const region = pendingImage
        ? await flattenFromPhoto(pendingImage, corners).catch(() => flatten(source, corners))
        : flatten(source, corners);
      const crop = await createImageBitmap(region);
      if (adding.current) {
        // Part of a list that wraps round the pack: keep this reading and
        // go back for the next photo.
        await addPhotoOfList(crop);
        if (!signal.aborted) navigate(retakeTo, { replace: true });
        return;
      }
      const id = await scanImage(crop, signal);
      if (signal.aborted) return;
      navigate(id ? `/results/${id}` : "/results", { replace: true });
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof TooFewIngredientsError) {
        setError({
          title: "We couldn't find enough ingredients in that area.",
          body: "Move the corners closer to the ingredients, or retake the photo in better light.",
        });
      } else {
        setError({
          title: "Something went wrong reading the photo.",
          body: (err as Error).message,
        });
      }
    } finally {
      running.current = false;
      adding.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }, [navigate, corners, source, retakeTo, pendingImage]);

  const addAnotherPhoto = () => {
    adding.current = true;
    void runScan();
  };

  if (!pendingImage) return <Navigate to="/" replace />;

  // Corners in stage pixels.
  const pts = fit ? corners.map((p) => ({ x: fit.x + p.x * fit.w, y: fit.y + p.y * fit.h })) : null;

  const loadingModels = busy && ocr.status === "loading";
  const pct = ocr.total > 0 ? Math.min(100, Math.round((ocr.loaded / ocr.total) * 100)) : 0;

  const CORNER_NAMES = ["Top left", "Top right", "Bottom right", "Bottom left"];
  const photoNo = earlier + 1;

  return (
    <Layout media context={`Photo ${photoNo} of ${photoNo}`} back backTo={retakeTo}>
      <div className="es-crop es-crop-wrap">
        <p className="es-crop__hint">
          {earlier > 0
            ? "Drag the corners around the next part of the list."
            : "Drag the corners around the ingredients."}
        </p>
        {/* Move/up/cancel live only here: captured pointer events from the
            selection and its handles bubble up to the stage. */}
        <div
          className="es-crop__stage"
          ref={stageRef}
          onPointerDown={onStageTap}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {fit && previewUrl && (
            <img
              src={previewUrl}
              alt="Your photo"
              style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h }}
            />
          )}
          {fit && pts && (
            <>
              <svg className="es-crop__svg" width={stage.w} height={stage.h} aria-hidden="true">
                <path
                  className="es-crop__shade"
                  d={`M0 0H${stage.w}V${stage.h}H0Z M${pts.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
                />
                <polygon
                  className="es-crop__keyline"
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                />
                <polygon
                  className="es-crop__edge es-crop__edge--grab"
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  onPointerDown={onPointerDown("move")}
                  data-testid="crop-rect"
                />
              </svg>
              {!busy &&
                pts.map((p, i) => (
                  <span
                    key={i}
                    className="es-crop__handle"
                    style={{ left: p.x, top: p.y }}
                    onPointerDown={onPointerDown(i as 0 | 1 | 2 | 3)}
                    onKeyDown={onHandleKey(i as 0 | 1 | 2 | 3)}
                    data-active={activeCorner === i ? "true" : undefined}
                    tabIndex={0}
                    role="slider"
                    aria-label={`${CORNER_NAMES[i]} corner`}
                    aria-valuetext={`${Math.round(corners[i]!.x * 100)}% across, ${Math.round(corners[i]!.y * 100)}% down`}
                    aria-valuenow={Math.round(corners[i]!.x * 100)}
                  />
                ))}
              {activeCorner !== null && previewUrl && (
                <Loupe
                  corner={pts[activeCorner]!}
                  pts={pts}
                  fit={fit}
                  stage={stage}
                  imageUrl={previewUrl}
                />
              )}
            </>
          )}
          {!fit && !error && (
            <div className="es-overlay" role="status">
              <span className="es-spinner es-spinner--lg">
                <span className="es-spinner__ring" />
              </span>
              <p className="es-overlay__title">Opening the photo</p>
            </div>
          )}
        </div>
        {error && (
          <Banner kind="alert" title={error.title}>
            {error.body}
          </Banner>
        )}
        <div className="es-crop__actions">
          <button
            type="button"
            className="es-link"
            onClick={addAnotherPhoto}
            disabled={busy || !source}
          >
            <Icon name="imagePlus" small />
            {earlier > 0 ? "Still more of the list? Add another photo" : "Add another photo"}
          </button>
          <button
            type="button"
            className="es-btn es-btn--on-media"
            onClick={() => navigate(retakeTo, { replace: true })}
            disabled={busy}
          >
            <Icon name="retake" />
            Retake
          </button>
          <button
            type="button"
            className="es-btn es-btn--primary"
            onClick={() => void runScan()}
            disabled={busy || !source}
          >
            <Icon name="scan" />
            {earlier > 0 ? `Read all ${earlier + 1} photos` : "Read"}
          </button>
        </div>
        {busy && (
          <div className="es-overlay" role="status">
            {loadingModels ? (
              <DownloadProgress pct={pct} />
            ) : (
              <>
                <span className="es-spinner es-spinner--lg">
                  <span className="es-spinner__ring" />
                  <span className="es-spinner__label--reduced">Working</span>
                </span>
                <p className="es-overlay__title">
                  {adding.current ? "Reading this photo" : "Reading the ingredients"}
                </p>
              </>
            )}
            <p
              className="es-overlay__text"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Icon name="lock" small />
              This happens on your phone.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

/**
 * A magnified view of the photo around the corner being dragged, with the
 * selection's edges and a crosshair on the corner. Sits above the corner,
 * or below it when there is no room above.
 */
function Loupe({
  corner,
  pts,
  fit,
  stage,
  imageUrl,
}: {
  corner: Point;
  pts: Point[];
  fit: { x: number; y: number; w: number; h: number };
  stage: { w: number; h: number };
  imageUrl: string;
}) {
  const half = LOUPE / 2;
  const above = corner.y - LOUPE_GAP - LOUPE >= 0;
  const left = clamp(corner.x - half, 0, Math.max(0, stage.w - LOUPE));
  const top = above ? corner.y - LOUPE_GAP - LOUPE : corner.y + LOUPE_GAP;
  // Stage point -> loupe point: the corner lands in the middle.
  const toLoupe = (p: Point) => ({
    x: half + (p.x - corner.x) * LOUPE_ZOOM,
    y: half + (p.y - corner.y) * LOUPE_ZOOM,
  });
  return (
    <div
      className="es-magnifier"
      style={{ left, top, width: LOUPE, height: LOUPE }}
      aria-hidden="true"
    >
      <div
        className="es-magnifier__photo"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: `${fit.w * LOUPE_ZOOM}px ${fit.h * LOUPE_ZOOM}px`,
          backgroundPosition: `${half - (corner.x - fit.x) * LOUPE_ZOOM}px ${
            half - (corner.y - fit.y) * LOUPE_ZOOM
          }px`,
        }}
      />
      <svg width={LOUPE} height={LOUPE}>
        <polygon
          className="es-magnifier__edges"
          points={pts
            .map(toLoupe)
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
        />
      </svg>
      <div className="es-magnifier__cross" />
    </div>
  );
}
