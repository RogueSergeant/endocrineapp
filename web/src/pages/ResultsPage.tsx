import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HeaderLink, Layout } from "@/components/Layout";
import { SubstanceMatchCard } from "@/components/SubstanceMatchCard";
import { getScan } from "@/lib/history";
import { matchesFromDoc } from "@/lib/scan";
import { substanceDb, useScanStore } from "@/lib/store/scanStore";
import type { Match } from "@/types";

interface View {
  parsedIngredients: string[];
  matches: Match[];
}

export function ResultsPage() {
  const { scanId } = useParams();
  const current = useScanStore((s) => s.current);
  const [stored, setStored] = useState<View | null | "loading">(scanId ? "loading" : null);
  const [showIngredients, setShowIngredients] = useState(false);

  // Release the photo now we're past the crop page. (Clearing it on the
  // crop page itself would trip that page's "no photo" redirect.)
  useEffect(() => {
    useScanStore.getState().setPendingImage(null);
  }, []);

  // Fresh scans are already in memory; history entries (or a refreshed
  // results page) are loaded from IndexedDB.
  const fromMemory = scanId && current?.id === scanId ? current : !scanId ? current : null;

  useEffect(() => {
    if (!scanId || fromMemory) return;
    let cancelled = false;
    setStored("loading");
    void getScan(scanId).then((doc) => {
      if (cancelled) return;
      setStored(
        doc ? { parsedIngredients: doc.parsedIngredients, matches: matchesFromDoc(doc) } : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [scanId, fromMemory]);

  const view: View | null | "loading" = fromMemory
    ? { parsedIngredients: fromMemory.parsedIngredients, matches: fromMemory.matches }
    : stored;

  const header = (body: React.ReactNode) => (
    <Layout title="Results" actions={<HeaderLink to="/">New scan</HeaderLink>}>
      {body}
    </Layout>
  );

  if (view === "loading") return header(<p className="muted">Loading…</p>);
  if (!view) {
    return header(
      <div className="hero">
        <p>No scan loaded yet.</p>
        <Link to="/" className="btn btn-primary">
          Open scanner
        </Link>
      </div>,
    );
  }

  const flagged = view.matches.length;
  const summary =
    flagged === 0
      ? "No flagged substances found"
      : `${flagged} flagged substance${flagged === 1 ? "" : "s"} found`;

  return header(
    <>
      <h2 className="summary">{summary}</h2>
      {flagged === 0 ? (
        <p className="muted">
          None of the {substanceDb.substanceCount} substances we track were detected in this list.
          This does not mean the product is safe.
        </p>
      ) : (
        view.matches.map((m) => <SubstanceMatchCard key={m.substance.id} match={m} />)
      )}

      <button type="button" className="link-btn" onClick={() => setShowIngredients((v) => !v)}>
        {showIngredients ? "Hide" : "Show"} ingredients we read ({view.parsedIngredients.length})
      </button>
      {showIngredients && (
        <div className="section">
          <ol className="ingredients">
            {view.parsedIngredients.map((ing, i) => (
              <li key={`${ing}-${i}`}>{ing}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="footer-note">
        Source: edlists.org, {substanceDb.sourceLastUpdated}. Not medical advice.
      </p>
    </>,
  );
}
