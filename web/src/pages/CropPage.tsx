import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Layout } from "@/components/Layout";
import { useOcrStatus } from "@/lib/ocr/textRecognition";
import { scanImage, TooFewIngredientsError } from "@/lib/scan";
import { useScanStore } from "@/lib/store/scanStore";

// Phone photos are 12-48 MP. Anything past this adds memory pressure (iOS
// Safari kills tabs that use too much) without helping the OCR, which
// detects at <= 1920px anyway.
const MAX_SIDE = 2000;
const MIN_RECT_PX = 40;
const MIN_CROP_PX = 16;

/** Selection rectangle in normalised image coordinates (0-1). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = "move" | "tl" | "tr" | "bl" | "br";

interface Drag {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  start: Rect;
}

// Initial selection: middle 90% x 35% of the image, biased downward
// (ingredient lists usually live in the bottom half of a label).
const INITIAL_RECT: Rect = { x: 0.05, y: 0.5 - 0.35 / 2, w: 0.9, h: 0.35 };

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

export function CropPage() {
  const navigate = useNavigate();
  const pendingImage = useScanStore((s) => s.pendingImage);
  const ocr = useOcrStatus();
  const stageRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState<Rect>(INITIAL_RECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const running = useRef(false);
  // Aborted when the page unmounts, so a scan the user walked away from
  // can't save, replace the current scan or navigate them back.
  const unmounted = useRef(new AbortController());

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

  const onPointerDown = (mode: DragMode) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busy) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      start: rect,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !fit) return;
    const dx = (e.clientX - d.startX) / fit.w;
    const dy = (e.clientY - d.startY) / fit.h;
    const minW = Math.min(1, MIN_RECT_PX / fit.w);
    const minH = Math.min(1, MIN_RECT_PX / fit.h);
    const s = d.start;
    const right = s.x + s.w;
    const bottom = s.y + s.h;
    let next: Rect;
    // Each corner drag keeps the opposite corner fixed.
    switch (d.mode) {
      case "move":
        next = { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
        break;
      case "tl": {
        const x = clamp(s.x + dx, 0, right - minW);
        const y = clamp(s.y + dy, 0, bottom - minH);
        next = { x, y, w: right - x, h: bottom - y };
        break;
      }
      case "tr": {
        const y = clamp(s.y + dy, 0, bottom - minH);
        next = { x: s.x, y, w: clamp(s.w + dx, minW, 1 - s.x), h: bottom - y };
        break;
      }
      case "bl": {
        const x = clamp(s.x + dx, 0, right - minW);
        next = { x, y: s.y, w: right - x, h: clamp(s.h + dy, minH, 1 - s.y) };
        break;
      }
      case "br":
        next = { ...s, w: clamp(s.w + dx, minW, 1 - s.x), h: clamp(s.h + dy, minH, 1 - s.y) };
        break;
    }
    setRect(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  // Tapping outside the selection re-centres it on the tap.
  const onStageTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || !fit || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    const px = (e.clientX - box.left - fit.x) / fit.w;
    const py = (e.clientY - box.top - fit.y) / fit.h;
    setRect((r) => ({
      ...r,
      x: clamp(px - r.w / 2, 0, 1 - r.w),
      y: clamp(py - r.h / 2, 0, 1 - r.h),
    }));
  };

  const runScan = useCallback(async () => {
    // Ref guard (not just `busy`): a quick double tap can get past the
    // state check before React re-renders.
    if (running.current || !source) return;
    const { signal } = unmounted.current;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const W = source.width;
      const H = source.height;
      const sx = clamp(Math.round(rect.x * W), 0, W - 1);
      const sy = clamp(Math.round(rect.y * H), 0, H - 1);
      const sw = Math.max(MIN_CROP_PX, Math.min(W - sx, Math.round(rect.w * W)));
      const sh = Math.max(MIN_CROP_PX, Math.min(H - sy, Math.round(rect.h * H)));
      const crop = await createImageBitmap(source, sx, sy, sw, sh);
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
  }, [navigate, rect, source]);

  if (!pendingImage) return <Navigate to="/" replace />;

  const px = fit
    ? {
        left: fit.x + rect.x * fit.w,
        top: fit.y + rect.y * fit.h,
        width: rect.w * fit.w,
        height: rect.h * fit.h,
      }
    : null;

  const loadingModels = busy && ocr.status === "loading";
  const pct = ocr.total > 0 ? Math.min(100, Math.round((ocr.loaded / ocr.total) * 100)) : 0;

  return (
    <Layout title="Select the ingredients" bare>
      <div className="crop-page">
        <p className="crop-hint">Drag the box over the ingredient list, then tap Read.</p>
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
          {fit && px && (
            <>
              <div className="crop-dim" style={{ left: 0, right: 0, top: 0, height: px.top }} />
              <div
                className="crop-dim"
                style={{ left: 0, right: 0, top: px.top + px.height, bottom: 0 }}
              />
              <div
                className="crop-dim"
                style={{ left: 0, width: px.left, top: px.top, height: px.height }}
              />
              <div
                className="crop-dim"
                style={{ left: px.left + px.width, right: 0, top: px.top, height: px.height }}
              />
              <div
                className="crop-rect"
                style={px}
                onPointerDown={onPointerDown("move")}
                data-testid="crop-rect"
              />
              {(
                [
                  ["tl", px.left, px.top],
                  ["tr", px.left + px.width, px.top],
                  ["bl", px.left, px.top + px.height],
                  ["br", px.left + px.width, px.top + px.height],
                ] as const
              ).map(([mode, left, top]) => (
                <div
                  key={mode}
                  className="crop-handle"
                  style={{ left, top }}
                  onPointerDown={onPointerDown(mode)}
                  aria-hidden="true"
                />
              ))}
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
            onClick={() => navigate("/", { replace: true })}
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
