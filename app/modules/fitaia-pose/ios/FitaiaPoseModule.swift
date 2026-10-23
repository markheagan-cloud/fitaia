import ExpoModulesCore
import Vision
import UIKit
import CoreImage

public class FitaiaPoseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FitaiaPose")

    Constants([
      "isAvailable": true,
      "canSegment": true
    ])

    /// Détoure la personne d'un selfie (Apple Vision, sur l'appareil, gratuit) → PNG avec fond transparent.
    AsyncFunction("segmentPerson") { (uri: String) -> String in
      guard let url = URL(string: uri), let data = try? Data(contentsOf: url), let image = UIImage(data: data), let cg = image.cgImage else {
        throw NSError(domain: "FitaiaPose", code: 1, userInfo: [NSLocalizedDescriptionKey: "Image illisible"])
      }
      let request = VNGeneratePersonSegmentationRequest()
      request.qualityLevel = .accurate
      request.outputPixelFormat = kCVPixelFormatType_OneComponent8
      let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
      try handler.perform([request])
      guard let mask = request.results?.first?.pixelBuffer else {
        throw NSError(domain: "FitaiaPose", code: 2, userInfo: [NSLocalizedDescriptionKey: "Personne non détectée"])
      }
      let ci = CIImage(cgImage: cg)
      var maskImage = CIImage(cvPixelBuffer: mask)
      let scale = CGAffineTransform(scaleX: ci.extent.width / maskImage.extent.width, y: ci.extent.height / maskImage.extent.height)
      maskImage = maskImage.transformed(by: scale)
      let blend = CIFilter(name: "CIBlendWithMask")!
      blend.setValue(ci, forKey: kCIInputImageKey)
      blend.setValue(CIImage(color: .clear).cropped(to: ci.extent), forKey: kCIInputBackgroundImageKey)
      blend.setValue(maskImage, forKey: kCIInputMaskImageKey)
      guard let out = blend.outputImage, let outCG = CIContext().createCGImage(out, from: ci.extent) else {
        throw NSError(domain: "FitaiaPose", code: 3, userInfo: [NSLocalizedDescriptionKey: "Détourage impossible"])
      }
      let png = UIImage(cgImage: outCG).pngData()!
      let dest = FileManager.default.temporaryDirectory.appendingPathComponent("selfie-cutout-\(Int(Date().timeIntervalSince1970)).png")
      try png.write(to: dest)
      return dest.absoluteString
    }

    View(FitaiaPoseView.self) {
      Events("onPose", "onError")

      Prop("active") { (view: FitaiaPoseView, active: Bool) in
        view.setActive(active)
      }

      Prop("position") { (view: FitaiaPoseView, position: String) in
        view.setCameraPosition(position == "front" ? .front : .back)
      }
    }
  }
}
