Pod::Spec.new do |s|
  s.name           = 'FitaiaPose'
  s.version        = '1.0.0'
  s.summary        = 'Détection de posture Apple Vision pour les défis FITAIA'
  s.description    = 'Vue caméra native qui publie les points du corps (VNDetectHumanBodyPoseRequest) vers JavaScript.'
  s.author         = 'FITAIA'
  s.homepage       = 'https://fitaia.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = "**/*.{h,m,swift}"
end
