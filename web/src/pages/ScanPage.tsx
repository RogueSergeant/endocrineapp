import { useEffect, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeaderLink, Layout } from "@/components/Layout";
import { preloadOcr, useOcrStatus } from "@/lib/ocr/textRecognition";
import { useScanStore } from "@/lib/store/scanStore";

export function ScanPage() {
  const navigate = useNavigate();
  const setPendingImage = useScanStore((s) => s.setPendingImage);

  // Start the model download while the user lines up the photo.
  useEffect(() => {
    preloadOcr();
  }, []);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingImage(file);
    navigate("/crop");
  };

  return (
    <Layout
      title="ED Scanner"
      back={false}
      actions={
        <>
          <HeaderLink to="/history">History</HeaderLink>
          <HeaderLink to="/settings">Settings</HeaderLink>
        </>
      }
    >
      <div className="hero">
        <h2>Scan ingredients</h2>
        <p>
          Take a photo of a cosmetic ingredient list to check it for endocrine disruptors. Photos
          are read on your phone and never uploaded.
        </p>
      </div>
      <div className="stack">
        <label className="btn btn-primary btn-large">
          Take photo
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
        <Link to="/paste" className="btn btn-secondary">
          Paste or type ingredients
        </Link>
      </div>
      <OcrProgress />
    </Layout>
  );
}

function OcrProgress() {
  const { status, loaded, total, error } = useOcrStatus();
  if (status === "ready" || status === "idle") return null;
  if (status === "error") {
    return (
      <div className="alert" style={{ marginTop: 16 }}>
        <strong>Couldn&apos;t load the text reader</strong>
        {error} You can still paste ingredients, or{" "}
        <button type="button" className="link-btn" style={{ padding: 0 }} onClick={preloadOcr}>
          try again
        </button>
        .
      </div>
    );
  }
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const done = total > 0 && loaded >= total;
  return (
    <div className="progress" role="status">
      {done
        ? "Preparing the text reader…"
        : `Downloading the text reader (first time only): ${pct}%`}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${done ? 100 : pct}%` }} />
      </div>
    </div>
  );
}
