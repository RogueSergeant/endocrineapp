package expo.modules.vlmextractor

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * PR 1 scaffolding. All entry points report that the VLM path is not
 * available on this device, which makes extractFromLabel fall back to
 * the existing OCR + rules pipeline. MediaPipe LlmInference + Gemma-3n
 * E2B land in PR 3.
 */
class VlmExtractorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VlmExtractor")

    AsyncFunction("isAvailable") {
      mapOf("supported" to false, "reason" to "unsupported_os")
    }

    AsyncFunction("prepareModel") {
      // Intentionally empty; real implementation downloads and loads the
      // MediaPipe .task bundle in PR 3.
    }

    AsyncFunction("extract") { _: String ->
      throw VlmExtractorUnavailableException()
    }
  }
}

private class VlmExtractorUnavailableException :
  CodedException("VLM extract is not yet implemented on Android")
