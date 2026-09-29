const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('expo/config-plugins');

const NATIVE_PACKAGE = 'com.envelo.notifications';
const EXPO_SERVICE =
  'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const EXPO_RECEIVER = 'expo.modules.notifications.service.NotificationsService';
const SOURCE_FILES = [
  'EnveloFirebaseMessagingService.kt',
  'EnveloNotificationsService.kt',
  'NotificationAvatar.kt',
  'ConversationHistory.kt',
];
const EXPO_NOTIFICATIONS_VERSION =
  require('expo-notifications/package.json').version;

function configureManifest(manifest) {
  manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const service = `${NATIVE_PACKAGE}.EnveloFirebaseMessagingService`;
  const receiver = `${NATIVE_PACKAGE}.EnveloNotificationsService`;
  app.service = (app.service ?? []).filter(
    (item) => ![EXPO_SERVICE, service].includes(item.$['android:name'])
  );
  app.service.push(
    { $: { 'android:name': EXPO_SERVICE, 'tools:node': 'remove' } },
    {
      $: { 'android:name': service, 'android:exported': 'false' },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } },
          ],
        },
      ],
    }
  );
  app.receiver = (app.receiver ?? []).filter(
    (item) => ![EXPO_RECEIVER, receiver].includes(item.$['android:name'])
  );
  app.receiver.push(
    { $: { 'android:name': EXPO_RECEIVER, 'tools:node': 'remove' } },
    {
      $: {
        'android:name': receiver,
        'android:exported': 'false',
        'android:enabled': 'true',
      },
      'intent-filter': [
        {
          action: [
            'expo.modules.notifications.NOTIFICATION_EVENT',
            'android.intent.action.BOOT_COMPLETED',
            'android.intent.action.REBOOT',
            'android.intent.action.QUICKBOOT_POWERON',
            'com.htc.intent.action.QUICKBOOT_POWERON',
            'android.intent.action.MY_PACKAGE_REPLACED',
          ].map((name) => ({ $: { 'android:name': name } })),
        },
      ],
    }
  );
  // Play Services must deliver to our service instead of proxy-rendering a card.
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    app,
    'firebase_messaging_notification_delegation_enabled',
    'false'
  );
  return manifest;
}

const GRADLE_MARKER = '// Envelo conversation notifications';
const NOTIFICATIONS_MAVEN_DEPENDENCY =
  /implementation 'host\.exp\.exponent:expo\.modules\.notifications:[^']+'/;
function configureGradle(contents) {
  const notificationsDependency = `implementation 'host.exp.exponent:expo.modules.notifications:${EXPO_NOTIFICATIONS_VERSION}'`;
  const markerIndex = contents.indexOf(GRADLE_MARKER);
  if (markerIndex !== -1) {
    // Keep upgrades idempotent even when prebuild reuses an older android/ tree.
    // Only update our injected block, not another Gradle dependency above it.
    return (
      contents.slice(0, markerIndex) +
      contents
        .slice(markerIndex)
        .replace(
          "implementation project(':expo-notifications')",
          notificationsDependency
        )
        .replace(NOTIFICATIONS_MAVEN_DEPENDENCY, notificationsDependency)
    );
  }
  return (
    `${contents}\n${GRADLE_MARKER}\ndependencies {\n` +
    // SDK 54 autolinking uses expo-notifications' prebuilt Maven artifact,
    // so there is no :expo-notifications Gradle project in a normal EAS build.
    `    ${notificationsDependency}\n` +
    `    implementation 'com.google.firebase:firebase-messaging:24.0.1'\n` +
    `    implementation 'androidx.core:core-ktx:1.15.0'\n` +
    `    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'\n}\n`
  );
}

module.exports = function withConversationNotifications(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = configureManifest(mod.modResults);
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error(
        'Envelo notifications require the Expo SDK 54 Groovy app build.gradle.'
      );
    }
    mod.modResults.contents = configureGradle(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const target = path.join(
        mod.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...NATIVE_PACKAGE.split('.')
      );
      await fs.mkdir(target, { recursive: true });
      for (const file of SOURCE_FILES) {
        await fs.copyFile(
          path.join(__dirname, 'android', file),
          path.join(target, file)
        );
      }
      return mod;
    },
  ]);
};

module.exports.configureManifest = configureManifest;
module.exports.configureGradle = configureGradle;
