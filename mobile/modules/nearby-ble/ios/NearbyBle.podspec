Pod::Spec.new do |s|
  s.name           = 'NearbyBle'
  s.version        = '0.1.0'
  s.summary        = 'Bluesight Bluetooth LE peripheral (card, inbox, photo)'
  s.description    = 'Advertises the Bluesight service and serves the GATT characteristics other phones read and write.'
  s.license        = 'MIT'
  s.author         = 'Bluesight'
  s.homepage       = 'https://example.com' # local module, never published
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
