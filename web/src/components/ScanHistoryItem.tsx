import { Link } from "react-router-dom";
import type { ScanDoc } from "@/types";

export function ScanHistoryItem({ scan }: { scan: ScanDoc }) {
  const date = new Date(scan.createdAt);
  const matchCount = scan.matches.length;
  const firstMatch = scan.matches[0]?.canonicalName;
  return (
    <Link to={`/results/${scan.id}`} className="card history-item">
      <div className="small muted">{date.toLocaleString()}</div>
      <div className="match-name">
        {matchCount === 0 ? "No flagged substances" : `${matchCount} flagged · ${firstMatch ?? ""}`}
      </div>
      <div className="small muted">{scan.parsedIngredients.length} ingredients read</div>
    </Link>
  );
}
