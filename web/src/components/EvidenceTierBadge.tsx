import type { ListId, Substance } from "@/types";
import { Icon } from "./Icon";

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

export const ENV_LABEL = "Environment";
export const ENV_HEADING = "Listed for environmental effects";
export const ENV_EXPLANATION =
  "On the lists for its effects on wildlife or the environment. Worth knowing, but the assessments did not identify effects on human health.";

/**
 * Listed only for effects on wildlife and the environment, like IPBC: the
 * EU found no endocrine effects in humans. A substance with neither flag
 * recorded (a retired one) counts as a health listing, to be safe.
 */
export function envOnly(s: Pick<Substance, "healthEffects" | "envEffects">): boolean {
  return !s.healthEffects && s.envEffects;
}

/**
 * The list a substance is on: its numeral, plus the label unless compact.
 * Tiers differ in lightness as well as hue, so they read in greyscale too.
 * An environment-only listing keeps its numeral but drops the tier colour.
 */
export function EvidenceTierBadge({
  tier,
  env = false,
  compact = false,
  small = false,
}: {
  tier: ListId;
  env?: boolean;
  compact?: boolean;
  small?: boolean;
}) {
  const cls = [
    "es-badge",
    env ? "es-badge--env" : `es-badge--t${tier}`,
    compact && "es-badge--compact",
    small && "es-badge--sm",
  ]
    .filter(Boolean)
    .join(" ");
  const label = env ? ENV_LABEL : TIER_LABEL[tier];
  return (
    <span className={cls} role="img" aria-label={`List ${NUMERAL[tier]}, ${label}`}>
      {env && <Icon name="leaf" small />}
      <span className="es-badge__num" aria-hidden="true">
        {NUMERAL[tier]}
      </span>
      {!compact && <span aria-hidden="true">{label}</span>}
    </span>
  );
}
