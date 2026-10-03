const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
  withMainApplication,
} = require('expo/config-plugins');

function configureApplication(contents) {
  const registration = 'add(com.envelo.calls.EnveloCallPackage())';
  if (contents.includes(registration)) return contents;
  const marker = 'PackageList(this).packages.apply {';
  if (!contents.includes(marker))
    throw new Error(
      'Calling requires the Expo SDK 54 Kotlin MainApplication template.'
    );
  return contents.replace(marker, `${marker}\n              ${registration}`);
}
function configureManifest(manifest) {
  const application =
    AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const name = 'com.envelo.calls.EnveloCallService';
  application.service = (application.service ?? []).filter(
    (entry) => entry.$['android:name'] !== name
  );
  application.service.push({
    $: {
      'android:name': name,
      'android:exported': 'false',
      'android:foregroundServiceType': 'microphone',
      'android:stopWithTask': 'true',
    },
  });
  return manifest;
}
module.exports = function withCalling(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.BLUETOOTH_CONNECT',
  ]);
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = configureManifest(mod.modResults);
    return mod;
  });
  config = withMainApplication(config, (mod) => {
    mod.modResults.contents = configureApplication(mod.modResults.contents);
    return mod;
  });
  config = withGradleProperties(config, (mod) => {
    const key = 'android.useFullClasspathForDexingTransform';
    mod.modResults = mod.modResults.filter(
      (entry) => entry.type !== 'property' || entry.key !== key
    );
    mod.modResults.push({ type: 'property', key, value: 'true' });
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const target = path.join(
        mod.modRequest.platformProjectRoot,
        'app/src/main/java/com/envelo/calls'
      );
      await fs.mkdir(target, { recursive: true });
      await fs.copyFile(
        path.join(__dirname, 'android/EnveloCallService.kt'),
        path.join(target, 'EnveloCallService.kt')
      );
      const proguard = path.join(
        mod.modRequest.platformProjectRoot,
        'app/proguard-rules.pro'
      );
      const content = await fs.readFile(proguard, 'utf8');
      if (!content.includes('// Envelo RealtimeKit'))
        await fs.appendFile(
          proguard,
          '\n// Envelo RealtimeKit\n-keep class realtimekit.org.webrtc.** { *; }\n-dontwarn org.chromium.build.BuildHooksAndroid\n'
        );
      return mod;
    },
  ]);
};
module.exports.configureApplication = configureApplication;
module.exports.configureManifest = configureManifest;
