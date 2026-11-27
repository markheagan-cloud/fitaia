import ExpoModulesCore
import AVFoundation
import Vision
import ImageIO

/// Vue caméra + détection de posture (Apple Vision). Émet `onPose` ≈ 15 fois par seconde, y compris quand personne n'est vu
/// (`found: false`), pour que l'app puisse guider la personne à la voix.
/// Points : épaule, coude, poignet, hanche, genou, cheville du côté le mieux vu, plus le nez, en coordonnées normalisées
/// de l'image caméra en portrait (0–1, origine en haut à gauche, image NON inversée même avec la caméra avant).
/// `aspect` = largeur / hauteur de cette image, pour calculer des angles justes en JavaScript.
class FitaiaPoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onPose = EventDispatcher()
  let onError = EventDispatcher()

  private let session = AVCaptureSession()
  private let output = AVCaptureVideoDataOutput()
  private let queue = DispatchQueue(label: "fitaia.pose", qos: .userInitiated)
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var position: AVCaptureDevice.Position = .front
  private var configuredPosition: AVCaptureDevice.Position?
  private var active = false
  private var lastTs: CFTimeInterval = 0
  private let minInterval: CFTimeInterval = 1.0 / 15.0
  /// Une personne en position de pompe est allongée : Vision la reconnaît mieux « debout ». On essaie donc aussi l'image
  /// tournée d'un quart de tour, et on garde la dernière orientation qui a marché.
  private var orientations: [CGImagePropertyOrientation] = [.up, .right, .left]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    self.layer.addSublayer(layer)
    previewLayer = layer
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  func setCameraPosition(_ p: AVCaptureDevice.Position) {
    position = p
    if active { startIfAllowed() }
  }

  func setActive(_ on: Bool) {
    active = on
    if on { startIfAllowed() } else { stop() }
  }

  private func emitPose(_ payload: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.onPose(payload)
    }
  }

  private func emitError(_ message: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.onError(["message": message])
    }
  }

  /// Demande la caméra d'abord, puis configure et démarre sur la file de la caméra (jamais sur le fil principal).
  private func startIfAllowed() {
    AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
      guard let self = self else { return }
      if !granted {
        self.emitError("FITAIA n’a pas accès à la caméra : autorise-la dans Réglages > FITAIA.")
        return
      }
      self.queue.async {
        guard self.active else { return }
        if self.configuredPosition != self.position {
          guard self.configure() else { return }
        }
        if !self.session.isRunning { self.session.startRunning() }
      }
    }
  }

  /// À appeler sur `queue`.
  private func configure() -> Bool {
    session.beginConfiguration()
    if session.canSetSessionPreset(.hd1280x720) { session.sessionPreset = .hd1280x720 }
    for input in session.inputs { session.removeInput(input) }
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
          let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
      session.commitConfiguration()
      emitError("Caméra indisponible")
      return false
    }
    session.addInput(input)
    if !session.outputs.contains(output) {
      output.alwaysDiscardsLateVideoFrames = true
      output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      output.setSampleBufferDelegate(self, queue: queue)
      if session.canAddOutput(output) { session.addOutput(output) }
    }
    if let conn = output.connection(with: .video) {
      if conn.isVideoOrientationSupported { conn.videoOrientation = .portrait }
      // Pas d'inversion de l'image analysée : l'aperçu de la caméra avant est inversé par iOS, l'app en tient compte.
      if conn.isVideoMirroringSupported {
        conn.automaticallyAdjustsVideoMirroring = false
        conn.isVideoMirrored = false
      }
    }
    session.commitConfiguration()
    configuredPosition = position
    return true
  }

  private func stop() {
    queue.async { if self.session.isRunning { self.session.stopRunning() } }
  }

  deinit { session.stopRunning() }

  /// Point Vision (origine en bas à gauche, dans l'image redressée selon `o`) → point de l'image caméra (origine en haut à gauche).
  private func toBuffer(_ p: CGPoint, _ o: CGImagePropertyOrientation) -> (Double, Double) {
    let x = Double(p.x), y = Double(p.y)
    switch o {
    case .right: return (1 - y, 1 - x) // image redressée = caméra tournée d'un quart de tour horaire
    case .left: return (y, x) // image redressée = caméra tournée d'un quart de tour anti-horaire
    default: return (x, 1 - y)
    }
  }

  private func analyse(_ pixel: CVPixelBuffer, _ o: CGImagePropertyOrientation) -> (payload: [String: Any], score: Double)? {
    let request = VNDetectHumanBodyPoseRequest()
    let handler = VNImageRequestHandler(cvPixelBuffer: pixel, orientation: o, options: [:])
    guard (try? handler.perform([request])) != nil, let obs = request.results?.first,
          let pts = try? obs.recognizedPoints(.all) else { return nil }
    func pt(_ j: VNHumanBodyPoseObservation.JointName) -> [String: Double] {
      guard let p = pts[j], p.confidence > 0 else { return ["x": 0, "y": 0, "c": 0] }
      let (x, y) = toBuffer(p.location, o)
      return ["x": x, "y": y, "c": Double(p.confidence)]
    }
    let left: [String: [String: Double]] = ["shoulder": pt(.leftShoulder), "elbow": pt(.leftElbow), "wrist": pt(.leftWrist), "hip": pt(.leftHip), "knee": pt(.leftKnee), "ankle": pt(.leftAnkle)]
    let right: [String: [String: Double]] = ["shoulder": pt(.rightShoulder), "elbow": pt(.rightElbow), "wrist": pt(.rightWrist), "hip": pt(.rightHip), "knee": pt(.rightKnee), "ankle": pt(.rightAnkle)]
    let lc = left.values.reduce(0.0) { $0 + ($1["c"] ?? 0) }
    let rc = right.values.reduce(0.0) { $0 + ($1["c"] ?? 0) }
    let useLeft = lc >= rc
    let w = Double(CVPixelBufferGetWidth(pixel)), h = Double(CVPixelBufferGetHeight(pixel))
    let payload: [String: Any] = [
      "found": true,
      "side": useLeft ? "left" : "right",
      "points": useLeft ? left : right,
      "nose": pt(.nose),
      "aspect": h > 0 ? w / h : 0.5625,
      "ts": CACurrentMediaTime() * 1000,
    ]
    return (payload, max(lc, rc))
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    if now - lastTs < minInterval { return }
    lastTs = now
    guard let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    var best: (payload: [String: Any], score: Double, o: CGImagePropertyOrientation)?
    for o in orientations {
      if let r = analyse(pixel, o) {
        if best == nil || r.score > best!.score { best = (payload: r.payload, score: r.score, o: o) }
        // 6 points sur 6 bien vus : inutile d'essayer les autres orientations
        if r.score >= 6 * 0.5 { break }
      }
    }
    guard let found = best else {
      emitPose(["found": false, "ts": now * 1000])
      return
    }
    if found.o != orientations.first {
      orientations.removeAll { $0 == found.o }
      orientations.insert(found.o, at: 0)
    }
    emitPose(found.payload)
  }
}
