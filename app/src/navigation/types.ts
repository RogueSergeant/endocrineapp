import type { ScanDoc } from "@/types";

export interface CropParams {
  uri: string;
  width: number;
  height: number;
}

export type RootStackParamList = {
  Scan: undefined;
  Crop: CropParams;
  Results: { scanId?: string; readOnlyScan?: ScanDoc } | undefined;
  History: undefined;
  SubstanceDetail: { substanceId: string };
  Settings: undefined;
};
