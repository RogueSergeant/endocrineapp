import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { ScanHistoryItem } from "@/components/ScanHistoryItem";
import { deleteScan, listScans } from "@/lib/history";
import type { ScanDoc } from "@/types";

export function HistoryPage() {
  const [scans, setScans] = useState<ScanDoc[] | null>(null);

  const refresh = useCallback(() => {
    void listScans().then(setScans);
  }, []);

  useEffect(refresh, [refresh]);

  const onDelete = async (scan: ScanDoc) => {
    if (!window.confirm("Delete this scan?")) return;
    try {
      await deleteScan(scan.id);
      refresh();
    } catch (err) {
      window.alert(`Couldn't delete: ${(err as Error).message}`);
    }
  };

  return (
    <Layout title="History">
      {scans === null ? null : scans.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>
          No scans yet. Scans are saved on this device only.
        </p>
      ) : (
        scans.map((scan) => (
          <div key={scan.id}>
            <ScanHistoryItem scan={scan} />
            <div className="delete-row">
              <button type="button" onClick={() => void onDelete(scan)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </Layout>
  );
}
