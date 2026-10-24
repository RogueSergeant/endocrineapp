import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Match } from "@/types";
import { EvidenceTierBadge } from "./EvidenceTierBadge";

const MATCH_TYPE_LABEL = {
  exact: "Exact match",
  fuzzy: "Likely match (OCR-corrected)",
  cas: "Matched by CAS number",
  possible: "Possible match: check the label",
} as const;

/** An object URL for `blob`, revoked when it changes or the card unmounts. */
function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

export function SubstanceMatchCard({ match }: { match: Match }) {
  const snippet = useObjectUrl(match.snippet);
  const possible = match.matchType === "possible";
  return (
    <Link
      to={`/substance/${encodeURIComponent(match.substance.id)}`}
      className={possible ? "card card-possible" : "card"}
    >
      <div className="match-head">
        <span className="match-name">{match.substance.canonicalName}</span>
        <EvidenceTierBadge tier={match.substance.evidenceTier} />
      </div>
      {possible ? (
        <div className="small">We read “{(match.readAs ?? match.matchedIngredient).trim()}”</div>
      ) : (
        <div className="small">Matched “{match.matchedIngredient.trim()}”</div>
      )}
      {snippet && <img className="match-snippet" src={snippet} alt="That line of your photo" />}
      <div className="small muted">
        {MATCH_TYPE_LABEL[match.matchType]} · confidence {Math.round(match.confidence * 100)}%
      </div>
    </Link>
  );
}
