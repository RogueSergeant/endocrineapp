import type { ScanDoc } from "@/types";

export type RootStackParamList = {
  Scan: undefined;
  Results: { scanId?: string; readOnlyScan?: ScanDoc } | undefined;
  History: undefined;
  SubstanceDetail: { substanceId: string };
  Settings: undefined;
};
