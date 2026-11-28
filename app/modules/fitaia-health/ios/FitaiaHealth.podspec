Pod::Spec.new do |s|
  s.name           = 'FitaiaHealth'
  s.version        = '1.0.0'
  s.summary        = 'Lecture de Santé (Apple Watch) pour FITAIA'
  s.description    = 'Lit dans Santé les pas, les calories actives, le dernier rythme cardiaque et les séances du jour. Lecture seule.'
  s.author         = 'FITAIA'
  s.homepage       = 'https://fitaia.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'HealthKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = "**/*.{h,m,swift}"
end
