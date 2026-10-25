import { Link } from "react-router-dom";
import { getSubstanceById } from "@/lib/store/scanStore";
import type { ListId, ScanDoc, StoredMatch } from "@/types";
import { EvidenceTierBadge, envOnly } from "./EvidenceTierBadge";
import { Icon } from "./Icon";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ScanHistoryItem({ scan, onDelete }: { scan: ScanDoc; onDelete: () => void }) {
  const when = DATE.format(new Date(scan.createdAt));
  // Counted as on the results page: possible matches aren't listed ingredients.
  const confirmed = scan.matches.filter((m) => m.matchType !== "possible");
  const possible = scan.matches.length - confirmed.length;
  // Environment-only listings are looked up in the current data, as the
  // results page does; they don't count towards the headline.
  const isEnv = (m: StoredMatch) => {
    const s = getSubstanceById(m.substanceId);
    return s ? envOnly(s) : false;
  };
  const env = confirmed.filter(isEnv);
  const health = confirmed.filter((m) => !isEnv(m));
  const tiers = ([1, 2, 3] as ListId[]).filter((t) => health.some((m) => m.evidenceTier === t));
  const envTier = env[0]?.evidenceTier;
  const title =
    health.length > 0
      ? plural(health.length, "listed ingredient", "listed ingredients")
      : env.length > 0
        ? `${plural(env.length, "ingredient", "ingredients")} listed for the environment`
        : possible > 0
          ? plural(possible, "possible match", "possible matches")
          : "No listed ingredients";
  return (
    <li className="es-history__item">
      <Link className="es-history__link" to={`/results/${scan.id}`}>
        <span className="es-history__title">{title}</span>
        <span className="es-history__meta">
          <time dateTime={new Date(scan.createdAt).toISOString()}>{when}</time>·{" "}
          {plural(scan.parsedIngredients.length, "ingredient", "ingredients")}
          {(tiers.length > 0 || envTier) && (
            <span className="es-row" style={{ gap: 4 }}>
              {tiers.map((t) => (
                <EvidenceTierBadge key={t} tier={t} compact small />
              ))}
              {envTier && <EvidenceTierBadge tier={envTier} env compact small />}
            </span>
          )}
        </span>
      </Link>
      <button
        type="button"
        className="es-btn es-btn--icon es-history__delete"
        aria-label={`Delete scan from ${when}`}
        onClick={onDelete}
      >
        <Icon name="trash" />
      </button>
    </li>
  );
}
