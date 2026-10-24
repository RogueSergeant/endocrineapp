import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { cleanOcrOutput } from "@/lib/ocr/cleanOcrOutput";
import { completeScan, TooFewIngredientsError } from "@/lib/scan";

export function PastePage() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
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
          ? "We couldn't find any ingredients in that. Type or paste at least one ingredient."
          : (err as Error).message,
      );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  return (
    <Layout title="Paste ingredients">
      <form onSubmit={(e) => void onSubmit(e)} className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          On iPhone, tap the box and choose <strong>Scan Text</strong> to read the label with the
          camera. On Android, copy the text from Google Lens and paste it here.
        </p>
        {error && (
          <div className="alert" role="alert" style={{ marginBottom: 0 }}>
            {error}
          </div>
        )}
        <label className="visually-hidden" htmlFor="ingredients">
          Ingredient list
        </label>
        <textarea
          id="ingredients"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ingredients: Aqua, Glycerin, …"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ""}>
          Check ingredients
        </button>
      </form>
    </Layout>
  );
}
