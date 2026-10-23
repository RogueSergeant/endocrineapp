import type { ListId } from "@/types";

const LABELS: Record<ListId, string> = {
  1: "EU identified",
  2: "Under EU investigation",
  3: "National evaluation",
};

export function EvidenceTierBadge({ tier }: { tier: ListId }) {
  return <span className={`badge tier-${tier}`}>{LABELS[tier]}</span>;
}
