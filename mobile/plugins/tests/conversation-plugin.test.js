const assert = require('node:assert/strict');
const test = require('node:test');
const {
  configureManifest,
  configureGradle,
} = require('../with-conversation-notifications');
const expoNotificationsVersion =
  require('expo-notifications/package.json').version;
const notificationsDependency = `implementation 'host.exp.exponent:expo.modules.notifications:${expoNotificationsVersion}'`;

test('registers exactly one native receiver/service while preserving unrelated entries', () => {
  const manifest = {
    manifest: {
      $: {},
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          service: [{ $: { 'android:name': 'unrelated.Service' } }],
          receiver: [{ $: { 'android:name': 'unrelated.Receiver' } }],
        },
      ],
    },
  };
  configureManifest(manifest);
  const first = JSON.stringify(manifest);
  configureManifest(manifest);
  assert.equal(
    JSON.stringify(manifest),
    first,
    'Repeated prebuild must be idempotent'
  );
  const app = manifest.manifest.application[0];
  assert.equal(
    app.service.filter(
      (s) =>
        s.$['android:name'] ===
        'com.envelo.notifications.EnveloFirebaseMessagingService'
    ).length,
    1
  );
  assert.equal(
    app.receiver.filter(
      (r) =>
        r.$['android:name'] ===
        'com.envelo.notifications.EnveloNotificationsService'
    ).length,
    1
  );
  assert.ok(
    app.service.some((s) => s.$['android:name'] === 'unrelated.Service')
  );
  assert.ok(
    app.receiver.some((r) => r.$['android:name'] === 'unrelated.Receiver')
  );
  assert.equal(
    app.service.find(
      (s) =>
        s.$['android:name'] ===
        'expo.modules.notifications.service.ExpoFirebaseMessagingService'
    ).$['tools:node'],
    'remove'
  );
  assert.equal(
    app['meta-data'].find(
      (m) =>
        m.$['android:name'] ===
        'firebase_messaging_notification_delegation_enabled'
    ).$['android:value'],
    'false'
  );
});

test('adds native compile dependencies once', () => {
  const configured = configureGradle('dependencies {}');
  assert.equal(configureGradle(configured), configured);
  assert.ok(configured.includes(notificationsDependency));
  assert.ok(configured.includes('firebase-messaging:24.0.1'));
  assert.equal(
    configureGradle(
      configured.replace(
        notificationsDependency,
        "implementation project(':expo-notifications')"
      )
    ),
    configured,
    'Repeated prebuild must repair the old Gradle dependency'
  );
  assert.equal(
    configureGradle(
      configured.replace(
        notificationsDependency,
        "implementation 'host.exp.exponent:expo.modules.notifications:0.32.16'"
      )
    ),
    configured,
    'Repeated prebuild must update a stale published notifications version'
  );
  const unrelatedDependency =
    "implementation 'host.exp.exponent:expo.modules.notifications:0.31.0'\n";
  assert.equal(
    configureGradle(unrelatedDependency + configured),
    unrelatedDependency + configured,
    'Do not change dependencies outside the injected block'
  );
});
