import Foundation
import CoreVideo

#if canImport(MediaPipeTasksVision)
import MediaPipeTasksVision

/// Détection du corps par MediaPipe Pose Landmarker (Google, gratuit, licence Apache 2.0, tourne sur l'iPhone sans
/// Internet). Conçu pour le sport : il suit bien une personne allongée en pompe, donne 33 points et, en plus, leur
/// position en 3D (en mètres) pour mesurer les angles même quand la personne n'est pas parfaitement de profil.
/// Si le modèle ne se charge pas, la vue revient à Apple Vision.
final class FitaiaMediaPipePose {
  private let landmarker: PoseLandmarker
  private var lastTs = 0

  // Indices BlazePose : épaule, coude, poignet, hanche, genou, cheville.
  private static let names = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]
  private static let left = [11, 13, 15, 23, 25, 27]
  private static let right = [12, 14, 16, 24, 26, 28]

  init?() {
    let bundles = [Bundle.main, Bundle(for: FitaiaMediaPipePose.self)]
    var found: String?
    for b in bundles where found == nil {
      found = b.path(forResource: "pose_landmarker_full", ofType: "task")
    }
    guard let path = found else { return nil }
    let options = PoseLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.runningMode = .video
    options.numPoses = 1
    options.minPoseDetectionConfidence = 0.5
    options.minPosePresenceConfidence = 0.5
    options.minTrackingConfidence = 0.5
    guard let l = try? PoseLandmarker(options: options) else { return nil }
    landmarker = l
  }

  /// Analyse une image (coordonnées de l'image caméra, origine en haut à gauche). `nil` = personne n'est vu.
  func analyse(_ pixel: CVPixelBuffer, tsMs: Int) -> [String: Any]? {
    let ts = max(tsMs, lastTs + 1) // MediaPipe exige des temps strictement croissants
    lastTs = ts
    guard let image = try? MPImage(pixelBuffer: pixel),
          let result = try? landmarker.detect(videoFrame: image, timestampInMilliseconds: ts),
          let lm = result.landmarks.first, lm.count >= 33 else { return nil }
    let world: [Landmark]? = result.worldLandmarks.first

    func conf(_ l: NormalizedLandmark) -> Double {
      let v = l.visibility?.doubleValue ?? 1
      let p = l.presence?.doubleValue ?? 1
      return min(v, p)
    }
    func pt(_ i: Int) -> [String: Double] {
      let l = lm[i]
      return ["x": Double(l.x), "y": Double(l.y), "c": conf(l)]
    }
    func side(_ idx: [Int]) -> [String: [String: Double]] {
      var out: [String: [String: Double]] = [:]
      for (k, i) in zip(FitaiaMediaPipePose.names, idx) { out[k] = pt(i) }
      return out
    }
    func side3d(_ idx: [Int]) -> [String: [String: Double]]? {
      guard let w = world, w.count >= 33 else { return nil }
      var out: [String: [String: Double]] = [:]
      for (k, i) in zip(FitaiaMediaPipePose.names, idx) {
        out[k] = ["x": Double(w[i].x), "y": Double(w[i].y), "z": Double(w[i].z)]
      }
      return out
    }

    let left = side(FitaiaMediaPipePose.left)
    let right = side(FitaiaMediaPipePose.right)
    let lc = left.values.reduce(0.0) { $0 + ($1["c"] ?? 0) }
    let rc = right.values.reduce(0.0) { $0 + ($1["c"] ?? 0) }
    let useLeft = lc >= rc
    var payload: [String: Any] = [
      "found": true,
      "engine": "mediapipe",
      "side": useLeft ? "left" : "right",
      "points": useLeft ? left : right,
      "left": left,
      "right": right,
      "nose": pt(0),
    ]
    if let wl = side3d(FitaiaMediaPipePose.left), let wr = side3d(FitaiaMediaPipePose.right) {
      payload["world"] = ["left": wl, "right": wr]
    }
    return payload
  }
}
#endif
