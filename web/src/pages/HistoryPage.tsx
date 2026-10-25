import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmSheet, Toast, useToast } from "@/components/Feedback";
import { Icon } from "@/components/Icon";
import { Layout } from "@/components/Layout";
import { ScanHistoryItem } from "@/components/ScanHistoryItem";
import { listScans } from "@/lib/history";
import { forgetScan } from "@/lib/scan";
import type { ScanDoc } from "@/types";

export function HistoryPage() {
  const [scans, setScans] = useState<ScanDoc[] | null>(null);
  const [deleting, setDeleting] = useState<ScanDoc | null>(null);
  const toast = useToast();

  const refresh = useCallback(() => {
    void listScans().then(setScans);
  }, []);

  useEffect(refresh, [refresh]);

  const cancel = useCallback(() => setDeleting(null), []);
  const confirm = async () => {
    const scan = deleting;
    setDeleting(null);
    if (!scan) return;
    try {
      await forgetScan(scan.id);
      refresh();
      toast.show("Scan deleted");
    } catch (err) {
      toast.show(`Couldn't delete: ${(err as Error).message}`);
    }
  };

  return (
    <Layout context="EndoScan">
      <h1 className="es-page-title">History</h1>
      {scans === null ? null : scans.length === 0 ? (
        <div className="es-sheet">
          <div className="es-empty">
            <Icon name="history" />
            <h2 className="es-empty__title">No scans yet</h2>
            <p className="es-empty__text">Scans you make are saved here, on this phone only.</p>
            <Link className="es-btn es-btn--primary" to="/camera">
              <Icon name="camera" />
              Take a photo
            </Link>
          </div>
        </div>
      ) : (
        <div className="es-sheet">
          <ul className="es-history">
            {scans.map((scan) => (
              <ScanHistoryItem key={scan.id} scan={scan} onDelete={() => setDeleting(scan)} />
            ))}
          </ul>
        </div>
      )}
      {deleting && (
        <ConfirmSheet
          title="Delete this scan?"
          text="It will be removed from this phone."
          confirmLabel="Delete"
          onConfirm={() => void confirm()}
          onCancel={cancel}
        />
      )}
      {toast.text && <Toast>{toast.text}</Toast>}
    </Layout>
  );
}
