import ExpoModulesCore
import AVFoundation
import Vision

/// Vue caméra + détection de posture (Apple Vision). Émet `onPose` à chaque image analysée (≈ 15–30 Hz).
/// Points : épaule, coude, poignet, hanche, genou, cheville du côté le mieux vu, en coordonnées normalisées (0–1, origine en haut à gauche).
class FitaiaPoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onPose = EventDispatcher()
  let onError = EventDispatcher()

  private let session = AVCaptureSession()
  private let output = AVCaptureVideoDataOutput()
  private let queue = DispatchQueue(label: "fitaia.pose", qos: .userInitiated)
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var position: AVCaptureDevice.Position = .back
  private var active = false
  private var lastTs: CFTimeInterval = 0
  private let minInterval: CFTimeInterval = 1.0 / 24.0

  private lazy var request: VNDetectHumanBodyPoseRequest = {
    let r = VNDetectHumanBodyPoseRequest()
    return r
  }()

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
    if active { configure() }
  }

  func setActive(_ on: Bool) {
    active = on
    if on { configure(); start() } else { stop() }
  }

  private func configure() {
    session.beginConfiguration()
    session.sessionPreset = .hd1280x720
    for input in session.inputs { session.removeInput(input) }
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
          let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
      session.commitConfiguration()
      onError(["message": "Caméra indisponible"])
      return
    }
    session.addInput(input)
    if !session.outputs.contains(output) {
      output.alwaysDiscardsLateVideoFrames = true
      output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      output.setSampleBufferDelegate(self, queue: queue)
      if session.canAddOutput(output) { session.addOutput(output) }
    }
    if let conn = output.connection(with: .video) {
      conn.videoOrientation = .portrait
      conn.isVideoMirrored = (position == .front)
    }
    session.commitConfiguration()
  }

  private func start() {
    AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
      guard let self = self else { return }
      if !granted { self.onError(["message": "Autorise la caméra dans Réglages"]); return }
      self.queue.async { if !self.session.isRunning { self.session.startRunning() } }
    }
  }

  private func stop() {
    queue.async { if self.session.isRunning { self.session.stopRunning() } }
  }

  deinit { session.stopRunning() }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    if now - lastTs < minInterval { return }
    lastTs = now
    guard let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let handler = VNImageRequestHandler(cvPixelBuffer: pixel, orientation: .up, options: [:])
    do {
      try handler.perform([request])
      guard let obs = request.results?.first else {
        onPose(["found": false])
        return
      }
      let pts = try obs.recognizedPoints(.all)
      func pt(_ j: VNHumanBodyPoseObservation.JointName) -> [String: Double] {
        guard let p = pts[j] else { return ["x": 0, "y": 0, "c": 0] }
        // Vision : origine en bas à gauche → on renvoie l'origine en haut à gauche.
        return ["x": Double(p.location.x), "y": Double(1 - p.location.y), "c": Double(p.confidence)]
      }
      let left: [String: [String: Double]] = ["shoulder": pt(.leftShoulder), "elbow": pt(.leftElbow), "wrist": pt(.leftWrist), "hip": pt(.leftHip), "knee": pt(.leftKnee), "ankle": pt(.leftAnkle)]
      let right: [String: [String: Double]] = ["shoulder": pt(.rightShoulder), "elbow": pt(.rightElbow), "wrist": pt(.rightWrist), "hip": pt(.rightHip), "knee": pt(.rightKnee), "ankle": pt(.rightAnkle)]
      let lc = left.values.reduce(0.0) { $0 + ($1["c"] ?? 0) }
      let rc = right.values.reduce(0.0) { $0 + ($1["c"] ?? 0) }
      let side = lc >= rc ? left : right
      onPose(["found": true, "side": lc >= rc ? "left" : "right", "points": side, "ts": now])
    } catch {
      onError(["message": "Analyse impossible : \(error.localizedDescription)"])
    }
  }
}
