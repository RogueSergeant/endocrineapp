import { Link } from "react-router-dom";
import type { Match } from "@/types";
import { EvidenceTierBadge } from "./EvidenceTierBadge";

const MATCH_TYPE_LABEL = {
  exact: "Exact match",
  fuzzy: "Likely match (OCR-corrected)",
  cas: "Matched by CAS number",
} as const;

export function SubstanceMatchCard({ match }: { match: Match }) {
  return (
    <Link to={`/substance/${encodeURIComponent(match.substance.id)}`} className="card">
      <div className="match-head">
        <span className="match-name">{match.substance.canonicalName}</span>
        <EvidenceTierBadge tier={match.substance.evidenceTier} />
      </div>
      <div className="small">Matched “{match.matchedIngredient.trim()}”</div>
      <div className="small muted">
        {MATCH_TYPE_LABEL[match.matchType]} · confidence {Math.round(match.confidence * 100)}%
      </div>
    </Link>
  );
}
