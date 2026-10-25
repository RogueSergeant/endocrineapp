import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { cleanOcrOutput } from "@/lib/ocr/cleanOcrOutput";
import { completeScan, TooFewIngredientsError } from "@/lib/scan";

export function PastePage() {
  const navigate = useNavigate();
  // "Fix a word" on the results page opens this with what was read.
  const initial = (useLocation().state as { text?: string } | null)?.text ?? "";
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aborted on unmount, as on the crop page: a check the user walked away
  // from mid-save mustn't replace the current scan or navigate them back.
  const unmounted = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const controller = unmounted.current;
    if (busy || !controller) return;
    const { signal } = controller;
    setBusy(true);
    setError(null);
    try {
      const id = await completeScan(text, cleanOcrOutput(text), { minIngredients: 1, signal });
      if (signal.aborted) return;
      navigate(id ? `/results/${id}` : "/results", { replace: true });
    } catch (err) {
      if (signal.aborted) return;
      setError(
        err instanceof TooFewIngredientsError
          ? "Paste at least one ingredient to check."
          : (err as Error).message,
      );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const empty = text.trim() === "";
  return (
    <Layout context="Check a label">
      <h1 className="es-page-title">Paste ingredients</h1>

      <section
        className="es-sheet es-sheet__pad es-stack"
        style={{ gap: 8 }}
        aria-labelledby="tips-h"
      >
        <h2 className="es-section-label" id="tips-h">
          How to copy text from a photo
        </h2>
        <dl className="es-rows">
          <div className="es-rows__row">
            <dt>iPhone</dt>
            <dd>
              Open the photo, press and hold on the text, then tap Copy. Or tap the box below and
              choose Scan Text.
            </dd>
          </div>
          <div className="es-rows__row">
            <dt>Android</dt>
            <dd>Open the photo in Google Photos, tap Lens, select the text, then tap Copy.</dd>
          </div>
        </dl>
      </section>

      <form onSubmit={(e) => void onSubmit(e)} className="es-stack" style={{ gap: 24, flex: 1 }}>
        <div className={error ? "es-field es-field--error" : "es-field"}>
          <label className="es-field__label" htmlFor="inci">
            Ingredients
          </label>
          <textarea
            className="es-field__control es-field__control--inci"
            id="inci"
            aria-describedby="inci-help"
            aria-invalid={error ? true : undefined}
            readOnly={busy}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder="AQUA, GLYCERIN, …"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="es-field__help" id="inci-help">
            {error ?? "Paste or type the list, separated by commas."}
          </span>
        </div>

        <div className="es-bottom">
          {busy ? (
            <button
              type="button"
              className="es-btn es-btn--primary es-btn--large es-btn--block"
              aria-disabled="true"
              style={{ opacity: 1 }}
            >
              <span className="es-spinner">
                <span className="es-spinner__ring" />
              </span>
              Checking…
            </button>
          ) : (
            <button
              type="submit"
              className="es-btn es-btn--primary es-btn--large es-btn--block"
              onClick={(e) => {
                // Left enabled when empty, so it can say why nothing happens.
                if (!empty) return;
                e.preventDefault();
                setError("Paste at least one ingredient to check.");
              }}
            >
              Check ingredients
            </button>
          )}
        </div>
      </form>
    </Layout>
  );
}
