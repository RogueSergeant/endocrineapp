import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Match, MatchType } from "@/types";
import { EvidenceTierBadge } from "./EvidenceTierBadge";
import { Icon, type IconName } from "./Icon";

const MATCH_TYPE: Record<MatchType, { label: string; icon: IconName }> = {
  exact: { label: "Exact name", icon: "check" },
  fuzzy: { label: "Corrected reading", icon: "corrected" },
  cas: { label: "CAS number", icon: "hash" },
  possible: { label: "Possible match", icon: "question" },
};

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

/** What we read on the label, and how it led to this substance. */
function Seen({ match }: { match: Match }) {
  const read = match.matchedIngredient.trim();
  // The alias is stored normalised ("benzophenone 3"): show the label form.
  const likely = (match.substance.inciName ?? match.matchedAlias).toUpperCase();
  switch (match.matchType) {
    case "exact":
      return (
        <>
          On the label as <code>{read}</code>
        </>
      );
    case "fuzzy":
      return (
        <>
          We read <code>{read}</code>, the label likely says <code>{likely}</code>
        </>
      );
    case "cas":
      return (
        <>
          We read <code>{read}</code>, and the CAS number matches
        </>
      );
    case "possible":
      return (
        <>
          We read <code>{(match.readAs ?? read).trim()}</code>, which is close to{" "}
          <code>{likely}</code>
        </>
      );
  }
}

export function SubstanceMatchCard({ match }: { match: Match }) {
  const snippet = useObjectUrl(match.snippet);
  const type = MATCH_TYPE[match.matchType];
  return (
    <Link className="es-entry" to={`/substance/${encodeURIComponent(match.substance.id)}`}>
      <div className="es-entry__main">
        <h3 className="es-card-title">{breakable(match.substance.canonicalName)}</h3>
        <div className="es-entry__tags">
          <EvidenceTierBadge tier={match.substance.evidenceTier} />
          <span
            className={match.matchType === "possible" ? "es-mtype es-mtype--possible" : "es-mtype"}
          >
            <Icon name={type.icon} />
            {type.label}
          </span>
        </div>
        <p className="es-entry__seen">
          <Seen match={match} />
        </p>
        {snippet && (
          <img
            className="es-entry__crop"
            src={snippet}
            alt="The line on the label where we read it"
          />
        )}
      </div>
      <Icon name="chevronRight" className="es-entry__chev" />
    </Link>
  );
}

/**
 * A chemical name with line-break chances after hyphens, commas and
 * brackets, so long names wrap at their parts rather than mid-word.
 */
export function breakable(name: string) {
  const parts = name.split(/(?<=[-,)\]])/);
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<wbr key={i} />, p]));
}
