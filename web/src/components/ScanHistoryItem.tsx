import { Link } from "react-router-dom";
import type { ListId, ScanDoc } from "@/types";
import { EvidenceTierBadge } from "./EvidenceTierBadge";
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
  const tiers = ([1, 2, 3] as ListId[]).filter((t) => confirmed.some((m) => m.evidenceTier === t));
  const title =
    confirmed.length > 0
      ? plural(confirmed.length, "listed ingredient", "listed ingredients")
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
          {tiers.length > 0 && (
            <span className="es-row" style={{ gap: 4 }}>
              {tiers.map((t) => (
                <EvidenceTierBadge key={t} tier={t} compact small />
              ))}
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
