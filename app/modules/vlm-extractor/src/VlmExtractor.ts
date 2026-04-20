import { requireOptionalNativeModule } from "expo-modules-core";

import type {
  DeviceCapability,
  ExtractionResult,
} from "./VlmExtractor.types";

interface NativeVlmExtractor {
  isAvailable(): Promise<DeviceCapability>;
  prepareModel(): Promise<void>;
  extract(imageUri: string): Promise<ExtractionResult>;
}

const native = requireOptionalNativeModule<NativeVlmExtractor>("VlmExtractor");

export const VlmExtractor = {
  async isAvailable(): Promise<DeviceCapability> {
    if (!native) return { supported: false, reason: "native_module_missing" };
    return native.isAvailable();
  },

  async prepareModel(onProgress?: (fraction: number) => void): Promise<void> {
    if (!native) throw new Error("VLM native module not linked");
    // onProgress will be wired via an EventEmitter in PR 2/3. The PR 1
    // stub resolves immediately so integration tests can exercise the
    // call shape without a real download.
    void onProgress;
    await native.prepareModel();
  },

  async extract(imageUri: string): Promise<ExtractionResult> {
    if (!native) throw new Error("VLM native module not linked");
    return native.extract(imageUri);
  },
};
