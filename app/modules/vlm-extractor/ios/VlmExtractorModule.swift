import ExpoModulesCore

/// PR 1 scaffolding. All entry points report that the VLM path is not
/// available on this device, which makes `extractFromLabel` fall back to
/// the existing OCR + rules pipeline. MLX + Gemma-3n E2B land in PR 2.
public class VlmExtractorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VlmExtractor")

    AsyncFunction("isAvailable") { () -> [String: Any] in
      return ["supported": false, "reason": "unsupported_os"]
    }

    AsyncFunction("prepareModel") { () in
      // Intentionally empty; real implementation downloads and memory-maps
      // the MLX checkpoint in PR 2.
    }

    AsyncFunction("extract") { (_ imageUri: String) -> [String: Any] in
      throw Exception(
        name: "VlmExtractorUnavailable",
        description: "VLM extract is not yet implemented on iOS"
      )
    }
  }
}
