import { useCallback, useEffect, useState } from "react";
import { ConfirmSheet, Toast, useToast } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { Layout } from "@/components/Layout";
import { useOcrStatus } from "@/lib/ocr/textRecognition";
import { forgetAllScans } from "@/lib/scan";
import { substanceDb } from "@/lib/store/scanStore";
import { sourceMonth } from "./ResultsPage";

const READER_STATUS = {
  idle: "Loads when you scan",
  loading: "Getting ready",
  ready: "Ready",
  error: "Didn't load",
} as const;

/** What this site stores on the phone (history, text reader and app files). */
function useStorageUsed(): string | null {
  const [used, setUsed] = useState<string | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then(({ usage }) => {
        if (usage !== undefined) setUsed(`${(usage / 1024 / 1024).toFixed(1)} MB`);
      })
      .catch(() => undefined);
  }, []);
  return used;
}

export function SettingsPage() {
  const reader = useOcrStatus((s) => s.status);
  const storage = useStorageUsed();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  const cancel = useCallback(() => setConfirming(false), []);
  const deleteAll = async () => {
    setConfirming(false);
    try {
      await forgetAllScans();
      toast.show("History deleted");
    } catch (err) {
      toast.show(`Couldn't delete: ${(err as Error).message}`);
    }
  };

  return (
    <Layout context="EndoScan">
      <h1 className="es-page-title">Settings</h1>
      <div className="es-sheet es-sheet__pad es-stack" style={{ gap: 32 }}>
        <section className="es-block" aria-labelledby="about-h">
          <h2 className="es-section-label" id="about-h">
            About this app
          </h2>
          <dl className="es-rows">
            <Row k="Version" v={`${__APP_VERSION__} (${__APP_BUILD__})`} />
            <Row
              k="Lists"
              v={`edlists.org, ${sourceMonth()} update, ${substanceDb.substanceCount} substances`}
            />
            <Row k="Text reader" v={READER_STATUS[reader]} />
            {storage && <Row k="Storage used" v={storage} />}
          </dl>
        </section>

        <section className="es-block" aria-labelledby="data-h">
          <h2 className="es-section-label" id="data-h">
            Your data
          </h2>
          <p className="es-settings-text">
            Photos are read on this phone and never uploaded. Your scans are stored in this browser
            on this phone, and clearing the site&apos;s data removes them. Nothing is sent to a
            server.
          </p>
          <button
            type="button"
            className="es-btn es-btn--destructive"
            style={{ alignSelf: "flex-start", marginTop: 8 }}
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" />
            Delete all history
          </button>
        </section>

        <section className="es-block" aria-labelledby="src-h">
          <h2 className="es-section-label" id="src-h">
            Sources and credits
          </h2>
          <ul className="es-credits">
            <li>
              Substance data: the endocrine disruptor lists at{" "}
              <a
                className="es-link"
                href="https://edlists.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                edlists.org
              </a>
              , run by the Danish Environmental Protection Agency for participating national
              authorities. INCI names from the EU CosIng database; synonyms from PubChem.
            </li>
            <li>Text recognition runs on your device, using PaddleOCR (Apache-2.0).</li>
            <li className="es-meta">
              Icons: Lucide (ISC). Type: Atkinson Hyperlegible (SIL Open Font Licence).
            </li>
          </ul>
          <p className="es-meta">EndoScan isn&apos;t medical advice.</p>
        </section>
      </div>
      {confirming && (
        <ConfirmSheet
          title="Delete all history?"
          text="Every saved scan will be removed from this phone."
          confirmLabel="Delete all"
          onConfirm={() => void deleteAll()}
          onCancel={cancel}
        />
      )}
      {toast.text && <Toast>{toast.text}</Toast>}
    </Layout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="es-rows__row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
