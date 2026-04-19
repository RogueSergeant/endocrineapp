import type { ScanDoc } from "../types";

export type RootStackParamList = {
  Scan: undefined;
  Results: { scanId: string | null; fromHistory?: boolean; scan?: ScanDoc };
  History: undefined;
  SubstanceDetail: { substanceId: string };
  Settings: undefined;
};
