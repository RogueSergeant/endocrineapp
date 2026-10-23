import type { ReactNode } from "react";

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-label">{label}</h2>
      {children}
    </section>
  );
}
