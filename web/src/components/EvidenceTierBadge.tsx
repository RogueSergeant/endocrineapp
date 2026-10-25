import type { ListId } from "@/types";

const NUMERAL: Record<ListId, string> = { 1: "I", 2: "II", 3: "III" };

export const TIER_LABEL: Record<ListId, string> = {
  1: "EU identified",
  2: "Under EU investigation",
  3: "National evaluation",
};

/** Group headings on the results page. */
export const TIER_HEADING: Record<ListId, string> = {
  1: "Identified at EU level",
  2: "Under EU investigation",
  3: "Identified by a national authority",
};

export const TIER_EXPLANATION: Record<ListId, string> = {
  1: "Identified as an endocrine disruptor after a full EU evaluation, under REACH, the biocides rules or the plant protection rules.",
  2: "Being assessed under EU law because of concerns about endocrine disruption. Not a final conclusion.",
  3: "One participating national authority considers it to have endocrine disrupting properties. Not an EU-wide assessment.",
};

/**
 * The list a substance is on: its numeral, plus the label unless compact.
 * Tiers differ in lightness as well as hue, so they read in greyscale too.
 */
export function EvidenceTierBadge({
  tier,
  compact = false,
  small = false,
}: {
  tier: ListId;
  compact?: boolean;
  small?: boolean;
}) {
  const cls = [
    "es-badge",
    `es-badge--t${tier}`,
    compact && "es-badge--compact",
    small && "es-badge--sm",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} role="img" aria-label={`List ${NUMERAL[tier]}, ${TIER_LABEL[tier]}`}>
      <span className="es-badge__num" aria-hidden="true">
        {NUMERAL[tier]}
      </span>
      {!compact && <span aria-hidden="true">{TIER_LABEL[tier]}</span>}
    </span>
  );
}
