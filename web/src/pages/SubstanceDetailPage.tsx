import { useParams } from "react-router-dom";
import { EvidenceTierBadge } from "@/components/EvidenceTierBadge";
import { Layout } from "@/components/Layout";
import { Section } from "@/components/Section";
import { getSubstanceById } from "@/lib/store/scanStore";
import type { ListId } from "@/types";

// Where each list lives on edlists.org, for a substance without its own page.
const LIST_PAGE: Record<ListId, string> = {
  1: "https://edlists.org/the-ed-lists/list-i-substances-identified-as-endocrine-disruptors-by-the-eu",
  2: "https://edlists.org/the-ed-lists/list-ii-substances-under-eu-investigation-endocrine-disruption",
  3: "https://edlists.org/the-ed-lists/list-iii-substances-identified-as-endocrine-disruptors-by-participating-national-authorities",
};

const TIER_EXPLANATION: Record<ListId, string> = {
  1: "Legally identified as an endocrine disruptor at EU level.",
  2: "Currently under investigation by an EU regulatory process.",
  3: "Evaluated as endocrine-disrupting by a single national authority.",
};

export function SubstanceDetailPage() {
  const { substanceId } = useParams();
  const substance = substanceId ? getSubstanceById(substanceId) : undefined;

  if (!substance) {
    return (
      <Layout title="Substance">
        <p className="muted">
          This substance isn&apos;t in the current database. It may have been removed or renamed
          in a data update.
        </p>
      </Layout>
    );
  }

  // The site ignores search parameters, so link the substance's own page.
  const edlistsUrl = substance.edlistsUrl ?? LIST_PAGE[substance.evidenceTier];

  return (
    <Layout title={substance.canonicalName}>
      <h2 className="summary" style={{ overflowWrap: "anywhere" }}>
        {substance.canonicalName}
      </h2>
      <div style={{ marginBottom: 8 }}>
        <EvidenceTierBadge tier={substance.evidenceTier} />
      </div>
      <p className="muted small">{TIER_EXPLANATION[substance.evidenceTier]}</p>

      <Section label="Identifiers">
        {substance.casNumber && <div className="small">CAS: {substance.casNumber}</div>}
        {substance.ecNumber && <div className="small">EC: {substance.ecNumber}</div>}
        {substance.inciName && <div className="small">INCI: {substance.inciName}</div>}
        {!substance.casNumber && !substance.ecNumber && !substance.inciName && (
          <div className="small muted">None recorded.</div>
        )}
      </Section>

      <Section label="Aliases">
        <div className="small" style={{ overflowWrap: "anywhere" }}>
          {substance.aliases.length > 0 ? substance.aliases.join(", ") : "None recorded."}
        </div>
      </Section>

      <Section label="Effects">
        <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>{substance.healthEffects ? "Health effects flagged" : "No health flag"}</li>
          <li>
            {substance.envEffects ? "Environmental effects flagged" : "No environmental flag"}
          </li>
        </ul>
      </Section>

      <Section label="Assessments">
        {substance.assessments.length === 0 ? (
          <div className="small">No assessment metadata.</div>
        ) : (
          substance.assessments.map((a, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div className="small">
                List {a.listId} · {a.status}
              </div>
              <div className="small muted">
                {[a.regulatoryField, a.year ? String(a.year) : null].filter(Boolean).join(" · ") ||
                  "No further detail"}
              </div>
            </div>
          ))
        )}
      </Section>

      <a href={edlistsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
        Open on edlists.org
      </a>
    </Layout>
  );
}
