import { useEffect, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner, Toast } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { HeaderLink, Layout } from "@/components/Layout";
import { PhotosWaiting } from "@/components/PhotosWaiting";
import { reloadOntoUpdate, useUpdateReady } from "@/lib/appUpdate";
import { preloadOcr, useOcrStatus } from "@/lib/ocr/textRecognition";
import { useScanStore } from "@/lib/store/scanStore";
import { useOnline } from "@/lib/useOnline";

export function ScanPage() {
  const navigate = useNavigate();
  const setPendingImage = useScanStore((s) => s.setPendingImage);
  const online = useOnline();
  const updateReady = useUpdateReady();

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
      home
      status={
        online ? undefined : (
          <>
            <Icon name="wifiOff" small />
            Offline
          </>
        )
      }
      actions={
        <>
          <HeaderLink to="/history" icon="history" label="History" />
          <HeaderLink to="/settings" icon="settings" label="Settings" />
        </>
      }
    >
      <section className="es-hero">
        <h1 className="es-display">See what is on the lists.</h1>
        <p className="es-lead">
          Photograph an ingredient list and EndoScan shows which ingredients are on the EU endocrine
          disruptor lists. It reads the label on this phone.
        </p>
      </section>

      <PhotosWaiting />
      <OcrProgress />

      {/* Closed at first, so the buttons fit on the first screen. */}
      <details className="es-example">
        <summary className="es-example__label">
          <span>How a result looks</span>
          <Icon name="chevronDown" />
        </summary>
        <p className="es-inci" aria-label="Example ingredients with matches marked">
          AQUA, GLYCERIN,{" "}
          <mark className="es-m1" aria-label="List I match">
            4-METHYLBENZYLIDENE CAMPHOR
          </mark>
          , CETEARYL ALCOHOL,{" "}
          <mark className="es-m2" aria-label="List II match">
            BENZOPHENONE-3
          </mark>
          , PHENOXYETHANOL,{" "}
          <mark className="es-m3" aria-label="List III match">
            RESORCINOL
          </mark>
          , PARFUM.
        </p>
        <TierKey />
      </details>

      <section className="es-ways es-bottom" aria-label="Check a label">
        <Link className="es-btn es-btn--primary es-btn--large es-btn--block" to="/camera">
          <Icon name="camera" />
          Take a photo
        </Link>
        <label className="es-file es-file--block">
          <input type="file" accept="image/*" onChange={onFile} aria-label="Choose photos" />
          <span className="es-btn es-btn--secondary es-btn--block">
            <Icon name="images" />
            Choose photos
          </span>
        </label>
        <Link className="es-btn es-btn--secondary es-btn--block" to="/paste">
          <Icon name="paste" />
          Paste ingredients
        </Link>
      </section>

      {updateReady && (
        <Toast
          action={
            <button type="button" className="es-btn" onClick={reloadOntoUpdate}>
              Reload
            </button>
          }
        >
          A new version of EndoScan is ready.
        </Toast>
      )}
    </Layout>
  );
}

/** How matches are marked in an ingredient list. */
export function TierKey({
  short = false,
  env = true,
  possible = false,
}: {
  short?: boolean;
  env?: boolean;
  possible?: boolean;
}) {
  return (
    <ul className="es-key" aria-hidden="true">
      <li>
        <i className="k1" />
        {short ? "List I" : "List I, EU identified"}
      </li>
      <li>
        <i className="k2" />
        {short ? "List II" : "List II, under investigation"}
      </li>
      <li>
        <i className="k3" />
        {short ? "List III" : "List III, national"}
      </li>
      {env && (
        <li>
          <i className="ke" />
          {short ? "Environment" : "Environment only"}
        </li>
      )}
      {possible && (
        <li>
          <i className="kp" />
          Possible match
        </li>
      )}
    </ul>
  );
}

function OcrProgress() {
  const { status, loaded, total } = useOcrStatus();
  if (status === "ready" || status === "idle") return null;
  if (status === "error") {
    return (
      <div className="es-error-block">
        <Banner kind="alert" title="The text reader didn't load.">
          Check your connection and try again. You only need to be online once. You can still paste
          ingredients.
        </Banner>
        <button type="button" className="es-btn es-btn--secondary" onClick={preloadOcr}>
          <Icon name="retry" />
          Try again
        </button>
      </div>
    );
  }
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  if (total > 0 && loaded >= total) {
    return (
      <div className="es-spinner" role="status" style={{ fontWeight: 650 }}>
        <span className="es-spinner__ring" style={{ color: "var(--cobalt)" }} />
        <span>Preparing…</span>
      </div>
    );
  }
  return <DownloadProgress pct={pct} />;
}

export function DownloadProgress({ pct }: { pct: number }) {
  const label = "Getting the text reader ready (first time only)";
  return (
    <div
      className="es-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div className="es-progress__head">
        <span>{label}</span>
        <span className="es-progress__pct">{pct}%</span>
      </div>
      <div className="es-progress__track">
        <div className="es-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
