import { Layout } from "@/components/Layout";
import { Section } from "@/components/Section";
import { deleteAllScans } from "@/lib/history";
import { substanceDb } from "@/lib/store/scanStore";

export function SettingsPage() {
  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        "Delete all scans? This permanently removes your scan history from this device.",
      )
    ) {
      return;
    }
    try {
      await deleteAllScans();
      window.alert("All scans deleted.");
    } catch (err) {
      window.alert(`Failed: ${(err as Error).message}`);
    }
  };

  return (
    <Layout title="Settings">
      <Section label="App">
        <Row k="Version" v={__APP_VERSION__} />
        <Row k="Substance DB" v={substanceDb.version} />
        <Row k="Source updated" v={substanceDb.sourceLastUpdated} />
        <Row k="Substances tracked" v={String(substanceDb.substanceCount)} />
      </Section>

      <Section label="Data">
        <button type="button" className="btn btn-danger" onClick={() => void handleDeleteAll()}>
          Delete all my scan history
        </button>
      </Section>

      <Section label="Attribution">
        <p className="small" style={{ marginTop: 0 }}>
          Substance lists from edlists.org (Lists I, II, III). INCI mapping from the EU CosIng
          database. Synonym enrichment from PubChem. Text recognition by PaddleOCR (Apache-2.0).
        </p>
        <a
          href="https://edlists.org"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          Visit edlists.org
        </a>
      </Section>

      <Section label="Privacy">
        <p className="small" style={{ margin: 0 }}>
          Photos are read on your device and never uploaded. Your scan history is stored only in
          this browser; clearing site data removes it. This site is not medical advice.
        </p>
      </Section>
    </Layout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv-row">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
