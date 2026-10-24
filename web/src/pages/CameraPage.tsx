import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useScanStore } from "@/lib/store/scanStore";

// The file input's capture attribute is only a hint: Firefox for Android
// opens the gallery instead of the camera. A camera in the page works the
// same everywhere getUserMedia does.

// Not in TypeScript's DOM lib yet; Chromium-only.
declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  takePhoto(): Promise<Blob>;
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

/** Full sensor resolution where supported, otherwise the current preview frame. */
async function capture(video: HTMLVideoElement, track: MediaStreamTrack): Promise<Blob> {
  if (typeof ImageCapture === "function") {
    try {
      return await new ImageCapture(track).takePhoto();
    } catch {
      // Fall through to a frame grab.
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(video, 0, 0);
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
          <video ref={videoRef} playsInline muted autoPlay />
          {!live && <div className="busy-overlay">Opening the camera…</div>}
        </div>
        <div className="camera-actions">
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
