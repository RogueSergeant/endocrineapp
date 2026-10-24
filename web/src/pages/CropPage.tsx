import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Layout } from "@/components/Layout";
import { flattenedSize, isConvex, warpQuad, type Point, type Quad } from "@/lib/perspective";
import { useOcrStatus } from "@/lib/ocr/textRecognition";
import { scanImage, TooFewIngredientsError } from "@/lib/scan";
import { useScanStore } from "@/lib/store/scanStore";

// Phone photos are 12-48 MP. Anything past this adds memory pressure (iOS
// Safari kills tabs that use too much) without helping the OCR, which
// detects at <= 1920px anyway.
const MAX_SIDE = 2000;
const MIN_RECT_PX = 40;
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
const LOUPE = 120;
const LOUPE_ZOOM = 3;
const LOUPE_GAP = 70;

const shift = (q: Quad, dx: number, dy: number): Quad =>
  q.map((p) => ({ x: p.x + dx, y: p.y + dy })) as unknown as Quad;

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
          setError({
            title: "Couldn't open that photo",
            body: "Try taking it again, or choose a different image.",
          });
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
    const moved: Point = { x: clamp(s[d.mode].x + dx, 0, 1), y: clamp(s[d.mode].y + dy, 0, 1) };
    const next = s.map((p, i) => (i === d.mode ? moved : p)) as unknown as Quad;
    // Refuse a shape that folds over itself or has a side too short to grab.
    const onScreen = next.map((p) => ({ x: p.x * fit.w, y: p.y * fit.h }));
    const shortest = Math.min(
      ...onScreen.map((p, i) => {
        const q = onScreen[(i + 1) % 4]!;
        return Math.hypot(p.x - q.x, p.y - q.y);
      }),
    );
    if (isConvex(next) && shortest >= MIN_RECT_PX) setCorners(next);
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
      const crop = await createImageBitmap(flatten(source, corners));
      const id = await scanImage(crop, signal);
      if (signal.aborted) return;
      navigate(id ? `/results/${id}` : "/results", { replace: true });
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof TooFewIngredientsError) {
        setError({ title: "Couldn't read that", body: err.message });
      } else {
        setError({ title: "Scan failed", body: (err as Error).message });
      }
    } finally {
      running.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }, [navigate, corners, source]);

  if (!pendingImage) return <Navigate to="/" replace />;

  // Corners in stage pixels.
  const pts = fit ? corners.map((p) => ({ x: fit.x + p.x * fit.w, y: fit.y + p.y * fit.h })) : null;

  const loadingModels = busy && ocr.status === "loading";
  const pct = ocr.total > 0 ? Math.min(100, Math.round((ocr.loaded / ocr.total) * 100)) : 0;

  return (
    <Layout title="Select the ingredients" bare>
      <div className="crop-page">
        <p className="crop-hint">
          Drag the corners onto the corners of the ingredient list, then tap Read.
        </p>
        {error && (
          <div style={{ padding: "0 16px" }}>
            <div className="alert" role="alert">
              <strong>{error.title}</strong>
              {error.body}
            </div>
          </div>
        )}
        {/* Move/up/cancel live only here: captured pointer events from the
            selection and its handles bubble up to the stage. */}
        <div
          className="crop-stage"
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
              <svg className="crop-svg" width={stage.w} height={stage.h} aria-hidden="true">
                <path
                  className="crop-dim"
                  fillRule="evenodd"
                  d={`M0 0H${stage.w}V${stage.h}H0Z M${pts.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
                />
                <polygon
                  className="crop-rect"
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  onPointerDown={onPointerDown("move")}
                  data-testid="crop-rect"
                />
              </svg>
              {pts.map((p, i) => (
                <div
                  key={i}
                  className="crop-handle"
                  style={{ left: p.x, top: p.y }}
                  onPointerDown={onPointerDown(i as 0 | 1 | 2 | 3)}
                  aria-hidden="true"
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
          {(busy || !fit) && !error && (
            <div className="busy-overlay" role="status">
              <div className="spinner" />
              {!fit
                ? "Opening photo…"
                : loadingModels
                  ? `Downloading the text reader: ${pct}%`
                  : "Reading ingredients…"}
            </div>
          )}
        </div>
        <div className="crop-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(retakeTo, { replace: true })}
            disabled={busy}
          >
            Retake
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runScan()}
            disabled={busy || !source}
          >
            Read ingredients
          </button>
        </div>
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
      className="crop-loupe"
      style={{ left, top, width: LOUPE, height: LOUPE }}
      aria-hidden="true"
    >
      <div
        className="crop-loupe-photo"
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
          className="crop-loupe-edges"
          points={pts
            .map(toLoupe)
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
        />
        <path
          className="crop-loupe-cross"
          d={`M${half} ${half - 12}V${half + 12}M${half - 12} ${half}H${half + 12}`}
        />
      </svg>
    </div>
  );
}
