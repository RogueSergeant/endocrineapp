import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CameraPage } from "@/pages/CameraPage";
import { CropPage } from "@/pages/CropPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { PastePage } from "@/pages/PastePage";
import { ResultsPage } from "@/pages/ResultsPage";
import { ScanPage } from "@/pages/ScanPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SubstanceDetailPage } from "@/pages/SubstanceDetailPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScanPage />} />
        <Route path="/camera" element={<CameraPage />} />
        <Route path="/crop" element={<CropPage />} />
        <Route path="/paste" element={<PastePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/results/:scanId" element={<ResultsPage />} />
        <Route path="/substance/:substanceId" element={<SubstanceDetailPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
