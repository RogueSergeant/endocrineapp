import { useNavigate, useParams } from "react-router-dom";
import { EvidenceTierBadge, TIER_EXPLANATION } from "@/components/EvidenceTierBadge";
import { Icon } from "@/components/Icon";
import { Layout } from "@/components/Layout";
import { breakable } from "@/components/SubstanceMatchCard";
import { getSubstanceById } from "@/lib/store/scanStore";
import type { ListId } from "@/types";
import { sourceMonth } from "./ResultsPage";

// Where each list lives on edlists.org, for a substance without its own page.
const LIST_PAGE: Record<ListId, string> = {
  1: "https://edlists.org/the-ed-lists/list-i-substances-identified-as-endocrine-disruptors-by-the-eu",
  2: "https://edlists.org/the-ed-lists/list-ii-substances-under-eu-investigation-endocrine-disruption",
  3: "https://edlists.org/the-ed-lists/list-iii-substances-identified-as-endocrine-disruptors-by-participating-national-authorities",
};

export function SubstanceDetailPage() {
  const { substanceId } = useParams();
  const navigate = useNavigate();
  const substance = substanceId ? getSubstanceById(substanceId) : undefined;

  if (!substance) {
    return (
      <Layout context="Results">
        <div className="es-sheet">
          <div className="es-empty">
            <Icon name="question" />
            <h1 className="es-empty__title">We couldn&apos;t find that substance.</h1>
            <p className="es-empty__text">
              It may have been removed from the lists in the latest update.
            </p>
            <button type="button" className="es-btn es-btn--secondary" onClick={() => navigate(-1)}>
              Back to results
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // The site ignores search parameters, so link the substance's own page.
  const edlistsUrl = substance.edlistsUrl ?? LIST_PAGE[substance.evidenceTier];
  const ids = [
    substance.casNumber && { k: "CAS", v: substance.casNumber, mono: true },
    substance.ecNumber && { k: "EC", v: substance.ecNumber, mono: true },
    substance.inciName && { k: "INCI", v: substance.inciName, mono: false },
  ].filter((r): r is { k: string; v: string; mono: boolean } => Boolean(r));

  return (
    <Layout context="Results">
      <section className="es-detail-head" aria-labelledby="sub-h">
        <h1 className="es-page-title" id="sub-h">
          {breakable(substance.canonicalName)}
        </h1>
        <div className="es-entry__tags">
          <EvidenceTierBadge tier={substance.evidenceTier} />
        </div>
        <p>{TIER_EXPLANATION[substance.evidenceTier]}</p>
      </section>

      <div className="es-sheet es-sheet__pad es-stack" style={{ gap: 24 }}>
        <section className="es-block" aria-labelledby="id-h">
          <h2 className="es-section-label" id="id-h">
            Identifiers
          </h2>
          {ids.length === 0 ? (
            <p className="es-meta">None recorded.</p>
          ) : (
            <dl className="es-rows">
              {ids.map((r) => (
                <div className="es-rows__row" key={r.k}>
                  <dt>{r.k}</dt>
                  <dd className={r.mono ? "es-identifier" : undefined}>{r.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {substance.aliases.length > 0 && (
          <section className="es-block" aria-labelledby="aka-h">
            <h2 className="es-section-label" id="aka-h">
              Also known as
            </h2>
            <ul className="es-rows es-rows--aliases">
              {substance.aliases.map((a) => (
                <li className="es-rows__row" key={a}>
                  {breakable(a)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="es-block" aria-labelledby="fx-h">
          <h2 className="es-section-label" id="fx-h">
            Effects identified
          </h2>
          <dl className="es-rows">
            <div className="es-rows__row">
              <dt>Human health</dt>
              <dd>
                <Flag icon="health" on={substance.healthEffects} />
              </dd>
            </div>
            <div className="es-rows__row">
              <dt>Environment</dt>
              <dd>
                <Flag icon="leaf" on={substance.envEffects} />
              </dd>
            </div>
          </dl>
        </section>

        {substance.assessments.length > 0 && (
          <section className="es-block" aria-labelledby="as-h">
            <h2 className="es-section-label" id="as-h">
              Assessments
            </h2>
            <dl className="es-rows">
              {substance.assessments.map((a, i) => (
                <div className="es-rows__row" key={i}>
                  <dt>{a.regulatoryField ?? "Assessment"}</dt>
                  <dd>{[a.status, a.year ? String(a.year) : null].filter(Boolean).join(", ")}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <a
          className="es-link"
          href={edlistsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ alignSelf: "flex-start" }}
        >
          See the listing on edlists.org
          <Icon name="external" small />
        </a>
      </div>

      <p className="es-meta">Lists: edlists.org, {sourceMonth()} update.</p>
    </Layout>
  );
}

function Flag({ icon, on }: { icon: "health" | "leaf"; on: boolean }) {
  return (
    <span className={on ? "es-flag" : "es-flag es-flag--no"}>
      <Icon name={icon} />
      <span className="es-flag__value">{on ? "Yes" : "Not identified"}</span>
    </span>
  );
}
