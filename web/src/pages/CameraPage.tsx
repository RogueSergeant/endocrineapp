import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { sharpness } from "@/lib/sharpness";
import { useScanStore } from "@/lib/store/scanStore";

// The file input's capture attribute is only a hint: Firefox for Android
// opens the gallery instead of the camera. A camera in the page works the
// same everywhere getUserMedia does.

// Not in TypeScript's DOM lib yet; Chromium-only.
declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  takePhoto(): Promise<Blob>;
}

// Camera controls Chromium exposes on Android; absent from TypeScript's
// DOM lib and from other browsers, so every use is feature-detected.
interface CameraCapabilities {
  torch?: boolean;
  focusMode?: string[];
}
type CameraConstraint = {
  torch?: boolean;
  focusMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
};

function capabilitiesOf(track: MediaStreamTrack): CameraCapabilities {
  try {
    return (track.getCapabilities?.() ?? {}) as CameraCapabilities;
  } catch {
    return {};
  }
}

function applyCamera(track: MediaStreamTrack, c: CameraConstraint): Promise<void> {
  return track
    .applyConstraints({ advanced: [c as MediaTrackConstraintSet] })
    .catch(() => undefined);
}

type CameraError = { title: string; body: string };

function describeError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      title: "Camera access is blocked",
      body: "Allow camera access for this site in your browser settings, or use your camera app below.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: "No camera found", body: "Use your camera app or choose a photo instead." };
  }
  if (name === "NotReadableError") {
    return {
      title: "The camera is busy",
      body: "Another app may be using it. Close it and try again, or use your camera app below.",
    };
  }
  return {
    title: "Couldn't open the camera",
    body: "Use your camera app or choose a photo instead.",
  };
}

// Frames to choose from when taking the photo from the preview, and the
// size of the centre patch they are compared on.
const FRAMES = 5;
const FRAME_GAP_MS = 90;
const PATCH = 320;

const nextFrame = (video: HTMLVideoElement) =>
  new Promise<void>((resolve) => {
    if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => resolve());
    else setTimeout(resolve, FRAME_GAP_MS);
  });

/**
 * The sharpest of a few consecutive preview frames: a tap on the shutter
 * shakes the phone, and the frame at the instant of the tap is often the
 * blurriest of the lot. Compared on the centre of the frame, where the
 * ingredient list is framed.
 */
async function sharpestFrame(video: HTMLVideoElement): Promise<HTMLCanvasElement> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const make = (cw: number, ch: number) => {
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    return { c, ctx };
  };
  let best = make(w, h);
  let spare = make(w, h);
  const patch = make(PATCH, PATCH);
  const side = Math.min(w, h) / 2;
  let bestScore = -1;
  for (let i = 0; i < FRAMES; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, FRAME_GAP_MS));
      await nextFrame(video);
    }
    spare.ctx.drawImage(video, 0, 0);
    patch.ctx.drawImage(spare.c, (w - side) / 2, (h - side) / 2, side, side, 0, 0, PATCH, PATCH);
    const score = sharpness(patch.ctx.getImageData(0, 0, PATCH, PATCH).data, PATCH, PATCH);
    if (score > bestScore) {
      bestScore = score;
      [best, spare] = [spare, best];
    }
  }
  return best.c;
}

/**
 * Full sensor resolution (with the camera's own focus and processing)
 * where supported, otherwise the sharpest recent preview frame.
 */
async function capture(video: HTMLVideoElement, track: MediaStreamTrack): Promise<Blob> {
  if (typeof ImageCapture === "function") {
    try {
      return await new ImageCapture(track).takePhoto();
    } catch {
      // Fall through to the preview.
    }
  }
  const canvas = await sharpestFrame(video);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Capture failed"))),
      "image/jpeg",
      0.92,
    ),
  );
}

export function CameraPage() {
  const navigate = useNavigate();
  const setPendingImage = useScanStore((s) => s.setPendingImage);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [caps, setCaps] = useState<CameraCapabilities>({});
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError({
        title: "This browser can't show the camera here",
        body: "Use your camera app or choose a photo instead.",
      });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        // Ask high: ingredient lists are small print, and the browser
        // gives the closest the camera supports.
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      })
      .then(
        (stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          if (track) {
            const c = capabilitiesOf(track);
            setCaps(c);
            if (c.focusMode?.includes("continuous"))
              void applyCamera(track, { focusMode: "continuous" });
          }
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          video.play().then(
            () => setLive(true),
            () => setLive(true),
          );
        },
        (err: unknown) => {
          if (!cancelled) setError(describeError(err));
        },
      );
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const openInCrop = (image: Blob) => {
    setPendingImage(image);
    navigate("/crop", { replace: true, state: { retake: "/camera" } });
  };

  const onShutter = async () => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !track || busy) return;
    setBusy(true);
    try {
      openInCrop(await capture(video, track));
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  const onToggleTorch = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch;
    setTorch(on);
    void applyCamera(track, { torch: on });
  };

  // Tap the preview to focus there, where the camera supports it.
  const onPreviewTap = (e: ReactPointerEvent<HTMLVideoElement>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !caps.focusMode?.includes("single-shot")) return;
    const box = e.currentTarget.getBoundingClientRect();
    void applyCamera(track, {
      focusMode: "single-shot",
      pointsOfInterest: [
        { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height },
      ],
    });
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) openInCrop(file);
  };

  if (error) {
    return (
      <Layout title="Take photo">
        <div className="alert">
          <strong>{error.title}</strong>
          {error.body}
        </div>
        <div className="stack">
          <label className="btn btn-primary btn-large">
            Use camera app
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFile}
            />
          </label>
          <label className="btn btn-secondary">
            Choose from photos
            <input className="visually-hidden" type="file" accept="image/*" onChange={onFile} />
          </label>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Take photo" bare>
      <div className="camera-page">
        <p className="crop-hint">Fill the frame with the ingredient list, then tap the button.</p>
        <div className="camera-stage">
          <video ref={videoRef} playsInline muted autoPlay onPointerDown={onPreviewTap} />
          {!live && <div className="busy-overlay">Opening the camera…</div>}
        </div>
        <div className="camera-actions">
          {caps.torch && (
            <button
              type="button"
              className="torch-btn"
              aria-pressed={torch}
              onClick={onToggleTorch}
            >
              {torch ? "Light on" : "Light"}
            </button>
          )}
          <button
            type="button"
            className="shutter"
            aria-label="Take photo"
            onClick={() => void onShutter()}
            disabled={!live || busy}
          />
        </div>
      </div>
    </Layout>
  );
}
