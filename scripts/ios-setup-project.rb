# One-time (idempotent) setup of ios/App/App.xcodeproj beyond what `cap add ios` generates: the app's own Swift files
# (RestActivityPlugin, AppHapticsPlugin, AppViewController, the shared RestActivityAttributes) and the RestTimerWidget
# extension that draws the rest timer on the lock screen. Needs the xcodeproj gem: `gem install --user-install xcodeproj`.
# Run: ruby scripts/ios-setup-project.rb
require 'xcodeproj'

PROJECT = File.expand_path('../ios/App/App.xcodeproj', __dir__)
BUNDLE_ID = 'com.kianjavaheri.fitnesstracker'
DEPLOYMENT = '17.0'

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == 'App' } or abort 'No App target'

def file_ref(group, path)
  group.files.find { |f| f.path == path } || group.new_reference(path)
end

def add_source(target, ref)
  target.source_build_phase.add_file_reference(ref, true)
end

# The app's own Swift files.
app_group = project.main_group['App']
%w[RestActivityPlugin.swift AppHapticsPlugin.swift AppViewController.swift].each { |f| add_source(app, file_ref(app_group, f)) }

# Shared between the app and the widget.
shared = project.main_group['Shared'] || project.main_group.new_group('Shared', 'Shared')
attributes = file_ref(shared, 'RestActivityAttributes.swift')
add_source(app, attributes)

# The widget extension.
widget = project.targets.find { |t| t.name == 'RestTimerWidget' }
unless widget
  widget = project.new_target(:app_extension, 'RestTimerWidget', :ios, DEPLOYMENT, nil, :swift)
  widget_group = project.main_group['RestTimerWidget'] || project.main_group.new_group('RestTimerWidget', 'RestTimerWidget')
  add_source(widget, file_ref(widget_group, 'RestTimerWidget.swift'))
  file_ref(widget_group, 'Info.plist')
  %w[WidgetKit SwiftUI ActivityKit].each do |fw|
    widget.add_system_framework(fw)
  end

  app.add_dependency(widget)
  embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
          app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.dst_subfolder_spec = '13' # PlugIns
  build_file = embed.add_file_reference(widget.product_reference, true)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
add_source(widget, attributes)

widget.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}.RestTimerWidget"
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'RestTimerWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['INFOPLIST_KEY_CFBundleDisplayName'] = 'Rest Timer'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['SKIP_INSTALL'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
end

app.build_configurations.each do |config|
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
end

project.save
puts 'ios/App/App.xcodeproj: RestTimerWidget extension and app Swift files set up'
