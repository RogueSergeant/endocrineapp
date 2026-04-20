export type ModelState = "not_downloaded" | "downloading" | "ready";

export type UnsupportedReason =
  | "unsupported_os"
  | "insufficient_ram"
  | "insufficient_disk"
  | "unsupported_gpu"
  | "native_module_missing";

export type DeviceCapability =
  | { supported: true; modelState: ModelState }
  | { supported: false; reason: UnsupportedReason };

export interface ExtractionResult {
  productName: string | null;
  ingredients: string[];
  confidence: number;
  rawModelOutput: string;
}
