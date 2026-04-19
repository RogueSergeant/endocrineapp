import type { EvidenceTier } from "../../types";

export const TIER_LABEL: Record<EvidenceTier, string> = {
  1: "Legally identified EU",
  2: "Under EU investigation",
  3: "National authority review",
};

export const TIER_EXPLAINER: Record<EvidenceTier, string> = {
  1: "Legally identified as an endocrine disruptor at EU level.",
  2: "Under investigation by an EU body for endocrine-disrupting properties.",
  3: "Evaluated by at least one national authority as a potential endocrine disruptor.",
};

export const TIER_COLOR: Record<EvidenceTier, string> = {
  1: "#C53030", // red
  2: "#D69E2E", // amber
  3: "#718096", // muted grey
};

export const TIER_BG: Record<EvidenceTier, string> = {
  1: "#FED7D7",
  2: "#FAF089",
  3: "#E2E8F0",
};
