import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  EvidenceTierBadge,
  TIER_EXPLANATION,
  TIER_HEADING,
  TIER_LABEL,
} from "@/components/EvidenceTierBadge";
import { Banner, Toast } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { HeaderLink, Layout } from "@/components/Layout";
import { SubstanceMatchCard } from "@/components/SubstanceMatchCard";
import { getScan } from "@/lib/history";
import { matchesFromDoc } from "@/lib/scan";
import { substanceDb, useScanStore } from "@/lib/store/scanStore";
import type { ListId, Match } from "@/types";
import { TierKey } from "./ScanPage";

interface View {
  parsedIngredients: string[];
  matches: Match[];
}

const TIERS: ListId[] = [1, 2, 3];

// "Saved to History" is said once, the first time a scan is saved.
const SAVED_NOTE_KEY = "endoscan.savedNoteShown";
function firstSave(): boolean {
  try {
    if (localStorage.getItem(SAVED_NOTE_KEY)) return false;
    localStorage.setItem(SAVED_NOTE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1 is identified at EU level, 2 are under EU investigation and …" */
function tierSentence(byTier: Record<ListId, number>): string {
  const parts = TIERS.filter((t) => byTier[t] > 0).map((t) => {
    const n = byTier[t];
    const is = n === 1 ? "is" : "are";
    const has = n === 1 ? "has" : "have";
    if (t === 1) return `${n} ${is} identified at EU level`;
    if (t === 2) return `${n} ${is} under EU investigation`;
    return `${n} ${has} a national evaluation`;
  });
  if (parts.length === 0) return "";
  const last = parts.pop()!;
  return `${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}.`;
}

/** The source month as words: "2026-04" -> "April 2026". */
export function sourceMonth(): string {
  const [y, m] = substanceDb.sourceLastUpdated.split("-").map(Number);
  if (!y || !m) return substanceDb.sourceLastUpdated;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ResultsPage() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const current = useScanStore((s) => s.current);
  const [stored, setStored] = useState<View | null | "loading">(scanId ? "loading" : null);

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

  // A fresh scan with an id was saved; one without couldn't be.
  const [savedNote, setSavedNote] = useState(false);
  const freshId = fromMemory && scanId ? scanId : null;
  useEffect(() => {
    if (!freshId || !firstSave()) return;
    setSavedNote(true);
    const timer = setTimeout(() => setSavedNote(false), 5000);
    return () => clearTimeout(timer);
  }, [freshId]);
  const notSaved = Boolean(fromMemory && !scanId);

  const view: View | null | "loading" = fromMemory
    ? { parsedIngredients: fromMemory.parsedIngredients, matches: fromMemory.matches }
    : stored;

  const page = (body: ReactNode, withBar = true) => (
    <Layout
      context="Results"
      actions={<HeaderLink to="/camera" icon="scan" label="New scan" />}
      bar={
        withBar && (
          <Link className="es-btn es-btn--secondary" to="/camera">
            <Icon name="scan" />
            New scan
          </Link>
        )
      }
    >
      {body}
      {withBar && savedNote && (
        <Toast
          aboveBar
          action={
            <Link className="es-btn" to="/history">
              View
            </Link>
          }
        >
          Saved to History
        </Toast>
      )}
    </Layout>
  );

  if (view === "loading") {
    return page(
      <div className="es-spinner" role="status">
        <span className="es-spinner__ring" style={{ color: "var(--cobalt)" }} />
        <span>Loading…</span>
      </div>,
      false,
    );
  }
  if (!view) {
    return page(
      <div className="es-sheet">
        <div className="es-empty">
          <Icon name="question" />
          <h1 className="es-empty__title">That scan isn&apos;t here.</h1>
          <p className="es-empty__text">It may have been deleted from History.</p>
          <Link className="es-btn es-btn--primary" to="/camera">
            <Icon name="camera" />
            Take a photo
          </Link>
        </div>
      </div>,
      false,
    );
  }

  const confirmed = view.matches.filter((m) => m.matchType !== "possible");
  const possible = view.matches.filter((m) => m.matchType === "possible");
  const read = view.parsedIngredients.length;
  const byTier = { 1: 0, 2: 0, 3: 0 } as Record<ListId, number>;
  confirmed.forEach((m) => byTier[m.substance.evidenceTier]++);
  const nothing = confirmed.length === 0 && possible.length === 0;

  const fixWord = () => navigate("/paste", { state: { text: view.parsedIngredients.join(", ") } });

  return page(
    <>
      {notSaved && (
        <Banner
          kind="warning"
          title="This scan couldn't be saved to History. The phone may be low on storage."
          actions={
            <Link className="es-link" to="/history">
              Manage History
            </Link>
          }
        />
      )}

      <div className="es-sheet es-sheet--flush">
        <section className="es-summary es-sheet__summary" aria-labelledby="rs">
          <h1 className="es-page-title" id="rs">
            {confirmed.length > 0
              ? `${count(confirmed.length, "ingredient", "ingredients")} on the endocrine disruptor lists`
              : nothing
                ? "None of the ingredients we read are on the endocrine disruptor lists"
                : "No ingredients confirmed on the endocrine disruptor lists"}
          </h1>
          {!nothing && (
            <>
              <p className="es-lead">
                {[
                  tierSentence(byTier),
                  `We read ${count(read, "ingredient", "ingredients")}.`,
                  possible.length > 0 &&
                    `There ${possible.length === 1 ? "is" : "are"} ${confirmed.length > 0 ? "also " : ""}${count(possible.length, "possible match", "possible matches")} to check.`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
              <SummaryBar byTier={byTier} possible={possible.length} read={read} />
            </>
          )}
        </section>

        {TIERS.filter((t) => byTier[t] > 0).map((t) => (
          <section key={t} className={`es-group es-group--t${t}`} aria-labelledby={`g${t}`}>
            <div className="es-group__head">
              <EvidenceTierBadge tier={t} compact />
              <h2 className="es-group__heading" id={`g${t}`}>
                {TIER_HEADING[t]}
              </h2>
              <span className="es-group__count">{byTier[t]}</span>
            </div>
            <p className="es-group__note">{TIER_EXPLANATION[t]}</p>
            <ul className="es-group__list">
              {confirmed
                .filter((m) => m.substance.evidenceTier === t)
                .map((m) => (
                  <li key={m.substance.id}>
                    <SubstanceMatchCard match={m} />
                  </li>
                ))}
            </ul>
          </section>
        ))}

        {possible.length > 0 && (
          <section className="es-group es-group--possible" aria-labelledby="gp">
            <div className="es-group__head">
              <Icon name="question" />
              <h2 className="es-group__heading" id="gp">
                Possible matches
              </h2>
              <span className="es-group__count">{possible.length}</span>
            </div>
            <p className="es-group__note">
              These look close to a listed substance but we can&apos;t be sure from the photo. Check
              the spelling on the label.
            </p>
            <ul className="es-group__list">
              {possible.map((m) => (
                <li key={m.substance.id}>
                  <SubstanceMatchCard match={m} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {nothing && (
          <section className="es-group es-group--none" aria-labelledby="g0">
            <div className="es-group__head">
              <Icon name="check" />
              <h2 className="es-group__heading" id="g0">
                Checked against the lists
              </h2>
              <span className="es-group__count">{read}</span>
            </div>
            <p className="es-group__note">
              This means none of the {count(read, "ingredient", "ingredients")} we read match the{" "}
              {substanceDb.substanceCount} substances on edlists.org. It is not a safety test, and
              the lists do not cover every substance.
            </p>
          </section>
        )}

        <details className="es-expand" open={!nothing}>
          <summary>
            Ingredients we read ({read})
            <Icon name="chevronDown" />
          </summary>
          <div className="es-expand__body es-stack">
            <div>
              <MarkedIngredients ingredients={view.parsedIngredients} matches={view.matches} />
              {!nothing && <TierKey short possible={possible.length > 0} />}
            </div>
            <button
              type="button"
              className="es-link"
              style={{ alignSelf: "flex-start" }}
              onClick={fixWord}
            >
              Fix a word
            </button>
          </div>
        </details>

        <footer className="es-footer">
          <p>
            Lists:{" "}
            <a href="https://edlists.org" target="_blank" rel="noopener noreferrer">
              edlists.org
            </a>
            , {sourceMonth()} update.
          </p>
          <p>
            EndoScan reports which lists an ingredient appears on. It doesn&apos;t measure amounts
            or test products, and it isn&apos;t medical advice.
          </p>
        </footer>
      </div>
    </>,
  );
}

function SummaryBar({
  byTier,
  possible,
  read,
}: {
  byTier: Record<ListId, number>;
  possible: number;
  read: number;
}) {
  const listed = byTier[1] + byTier[2] + byTier[3];
  const rest = Math.max(0, read - listed - possible);
  const label = [
    `Of ${count(read, "ingredient", "ingredients")} read:`,
    ...TIERS.filter((t) => byTier[t] > 0).map(
      (t) => `${byTier[t]} on List ${["I", "II", "III"][t - 1]}`,
    ),
    possible > 0 && count(possible, "possible match", "possible matches"),
    `${rest} not on the lists`,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      <div className="es-summary__bar" role="img" aria-label={label}>
        {TIERS.map(
          (t) =>
            byTier[t] > 0 && (
              <span key={t} className={`es-summary__seg--t${t}`} style={{ flex: byTier[t] }} />
            ),
        )}
        {possible > 0 && <span className="es-summary__seg--possible" style={{ flex: possible }} />}
        {rest > 0 && <span style={{ flex: rest }} />}
      </div>
      <ul className="es-summary__legend">
        {TIERS.filter((t) => byTier[t] > 0).map((t) => (
          <li key={t}>
            <EvidenceTierBadge tier={t} compact small />
            {TIER_LABEL[t]}
          </li>
        ))}
        {possible > 0 && (
          <li>
            <span className="es-key" style={{ margin: 0 }}>
              <i className="kp" style={{ display: "inline-block" }} />
            </span>
            {count(possible, "possible match", "possible matches")}
          </li>
        )}
      </ul>
    </>
  );
}

/** The ingredient list as read, with each match marked in its list's style. */
function MarkedIngredients({ ingredients, matches }: { ingredients: string[]; matches: Match[] }) {
  const marks = new Map<number, string>();
  for (const m of matches) {
    // Matches from the looser reading carry no position: find their text.
    let i = m.ingredientPosition < ingredients.length ? m.ingredientPosition : -1;
    if (i < 0) {
      const text = (m.readAs ?? m.matchedIngredient).trim().toLowerCase();
      i = ingredients.findIndex((ing) => ing.trim().toLowerCase() === text);
    }
    if (i < 0 || marks.has(i)) continue;
    marks.set(i, m.matchType === "possible" ? "es-m-possible" : `es-m${m.substance.evidenceTier}`);
  }
  const label: Record<string, string> = {
    "es-m1": "List I match",
    "es-m2": "List II match",
    "es-m3": "List III match",
    "es-m-possible": "Possible match",
  };
  return (
    <p className="es-inci" aria-label="Ingredients read, with matches marked">
      {ingredients.map((ing, i) => {
        const cls = marks.get(i);
        return (
          <Fragment key={i}>
            {i > 0 && ", "}
            {cls ? (
              <mark className={cls} aria-label={`${label[cls]}: ${ing}`}>
                {ing}
              </mark>
            ) : (
              ing
            )}
          </Fragment>
        );
      })}
      .
    </p>
  );
}
