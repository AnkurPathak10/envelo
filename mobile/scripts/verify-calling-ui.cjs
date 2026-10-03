// Runs the actual provider and native adapter with deferred signaling/media.
// No accounts, meetings, push notifications, or database writes are performed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }
  ).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
    console,
    setTimeout: () => 1,
    clearTimeout() {},
    ...globals,
  });
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const contracts = load('lib/calls/contracts.ts', { '@/lib/api/client': {} });
const history = load('lib/calls/history.ts');
const mediaTypes = load('lib/calls/mediaTypes.ts');
const peer = { id: 'peer', displayName: 'Ankur', avatarUrl: null };
const record = (overrides = {}) => ({
  type: 'call',
  id: 'one',
  conversationId: 'chat',
  initiatorId: 'me',
  status: 'RINGING',
  hadVideo: false,
  createdAt: new Date().toISOString(),
  connectedAt: null,
  endedAt: null,
  durationSeconds: 0,
  ...overrides,
});
const credentials = (call) => ({
  call,
  authToken: 'test-only',
  meetingId: 'meeting',
  participantId: 'participant',
});
function harness() {
  let cursor = 0,
    dirty = true,
    value;
  const slots = [],
    pendingEffects = [];
  const commands = [],
    navigations = [],
    listeners = new Set();
  const timers = new Map();
  let nextTimer = 0;
  let permission = async () => ({ granted: true });
  let request = async (event) =>
    event === 'call:sync'
      ? { call: null }
      : {
          call: record({
            status: 'COMPLETED',
            endedAt: new Date().toISOString(),
          }),
        };
  let mediaCreates = 0,
    mediaLeaves = 0,
    mediaJoins = 0,
    updateMedia;
  const changed = (before, after) =>
    !before ||
    before.length !== after.length ||
    before.some((item, index) => !Object.is(item, after[index]));
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (next) => {
          const result = typeof next === 'function' ? next(slots[index]) : next;
          if (!Object.is(slots[index], result)) {
            slots[index] = result;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = { current: initial });
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps))
        slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = callback();
        });
      }
    },
  };
  const context = load(
    'lib/calls/CallContext.tsx',
    {
      react,
      'react/jsx-runtime': { jsx: (_type, props) => props },
      'react-native': {
        Keyboard: { dismiss() {} },
        AppState: { addEventListener: () => ({ remove() {} }) },
      },
      'expo-audio': {
        AudioModule: { requestRecordingPermissionsAsync: () => permission() },
      },
      'expo-router': {
        router: { navigate: (route) => navigations.push(route) },
      },
      '@/lib/auth/AuthContext': { useAuth: () => ({ user: { id: 'me' } }) },
      '@/lib/socket/SocketContext': { useSocket: () => socket },
      '@/lib/api/conversations': {
        createDirectConversation: async () => ({ id: 'inviter-chat' }),
      },
      './contracts': contracts,
      './mediaTypes': mediaTypes,
      './audioOwnership': { stopChatAudio: async () => undefined },
      './media': {
        callingAvailable: true,
        createCallMedia: async (_token, update) => {
          mediaCreates++;
          updateMedia = update;
          return {
            join: async () => {
              mediaJoins++;
              update({ ...mediaTypes.emptyMedia, joined: true });
            },
            leave: async () => {
              mediaLeaves++;
            },
            camera: async () => {},
            microphone: async () => {},
            speaker: async () => {},
            flip: async () => {},
          };
        },
      },
    },
    {
      setTimeout(callback, delay) {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    }
  );
  const socket = {
    connectionEpoch: 0,
    connectionState: 'disconnected',
    requestCall: async (event, payload) => {
      commands.push({ event, payload });
      return request(event, payload);
    },
    subscribeToCalls: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  function render() {
    for (let round = 0; dirty; round++) {
      assert.ok(round < 30, 'No effect/render loop');
      dirty = false;
      cursor = 0;
      value = context.CallProvider({ children: null }).value;
      while (pendingEffects.length) pendingEffects.shift()();
    }
  }
  async function flush() {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
      render();
    }
  }
  render();
  return {
    get value() {
      render();
      return value;
    },
    commands,
    navigations,
    dismissAutomatically() {
      render();
      const entry = [...timers.entries()].find(
        ([, timer]) => timer.delay === 2500
      );
      assert.ok(entry, 'Terminal calls schedule automatic dismissal');
      timers.delete(entry[0]);
      entry[1].callback();
      render();
    },
    setPermission(fn) {
      permission = fn;
    },
    setRequest(fn) {
      request = fn;
    },
    emit(event, call, extra = {}) {
      for (const listener of listeners)
        listener(
          event,
          event === 'call:incoming'
            ? {
                call,
                caller: peer,
                expiresAt: new Date(Date.now() + 45000).toISOString(),
                ...extra,
              }
            : { call, ...extra }
        );
      render();
    },
    update(state) {
      updateMedia(state);
      render();
    },
    flush,
    get mediaCreates() {
      return mediaCreates;
    },
    get mediaLeaves() {
      return mediaLeaves;
    },
    get mediaJoins() {
      return mediaJoins;
    },
  };
}
async function lifecycle() {
  for (const scenario of ['missed', 'other-device', 'declined', 'minimized']) {
    const h = harness();
    const ringing = record({ initiatorId: 'peer' });
    if (scenario === 'declined' || scenario === 'minimized') {
      h.setRequest(async () => credentials(record()));
      await h.value.start('chat', peer);
      if (scenario === 'minimized') {
        h.emit('call:accepted', record({ status: 'ONGOING' }));
        await h.flush();
        h.value.minimize();
      }
    } else h.emit('call:incoming', ringing);
    h.emit(
      scenario === 'other-device' ? 'call:accepted' : 'call:ended',
      record({
        initiatorId: 'peer',
        status:
          scenario === 'other-device'
            ? 'ONGOING'
            : scenario === 'missed'
              ? 'MISSED'
              : scenario === 'declined'
                ? 'DECLINED'
                : 'COMPLETED',
      })
    );
    assert.equal(h.value.active.phase, 'ended');
    h.dismissAutomatically();
    await h.flush();
    assert.equal(h.value.active, null);
    assert.equal(
      h.navigations.length,
      0,
      `${scenario} must not navigate automatically`
    );
  }
  {
    const h = harness();
    h.emit('call:incoming', record({ initiatorId: 'peer' }));
    h.emit('call:ended', record({ status: 'COMPLETED' }));
    h.value.dismiss();
    await h.flush();
    assert.equal(
      h.navigations.length,
      1,
      'Explicit Back to chat still navigates'
    );
  }
  {
    const h = harness();
    const ongoing = record({ status: 'ONGOING' }); // This user originally started it, then left.
    h.setRequest(async () => ({
      call: ongoing,
      caller: peer,
      guest: true,
      expiresAt: new Date(Date.now() + 45000).toISOString(),
    }));
    await h.value.sync();
    assert.equal(
      h.value.active.phase,
      'ringing',
      'The original initiator can recover a fresh invitation after leaving'
    );
    assert.equal(h.mediaCreates, 0);
  }
  {
    const h = harness();
    const ongoing = record({ status: 'ONGOING', initiatorId: 'peer' });
    h.emit('call:incoming', ongoing, { guest: true });
    h.setRequest(async () => ({
      ...credentials(ongoing),
      guest: true,
      caller: peer,
    }));
    await h.value.sync();
    assert.equal(
      h.value.active.notice,
      'Answered on another device',
      'Sync repairs a missed other-device accept event'
    );
    assert.equal(h.mediaCreates, 0);
  }
  {
    // A mid-call guest rings even though the shared log is already ONGOING.
    const h = harness();
    const ongoing = record({
      status: 'ONGOING',
      initiatorId: 'original-caller',
      connectedAt: new Date().toISOString(),
    });
    const me = { id: 'me', displayName: 'Me', avatarUrl: null };
    const third = { id: 'third', displayName: 'Third', avatarUrl: null };
    h.emit('call:incoming', ongoing, {
      guest: true,
      participants: [peer, third],
      groupCall: true,
    });
    assert.equal(h.value.active.phase, 'ringing');
    h.setRequest(async (event) =>
      event === 'call:sync'
        ? {
            call: ongoing,
            caller: peer,
            guest: true,
            participants: [peer, third],
            groupCall: true,
          }
        : { call: ongoing }
    );
    await h.value.sync();
    assert.equal(
      h.value.active.phase,
      'ringing',
      'Refreshing a guest invitation must not silently accept it'
    );
    h.emit('call:accepted', ongoing, {
      participantUserId: 'third',
      participants: [peer, third],
    });
    assert.equal(
      h.value.active.phase,
      'ringing',
      'Another person joining must not answer this invitation'
    );
    await h.value.end();
    assert.equal(h.commands.at(-1).event, 'call:decline');
    assert.equal(h.mediaCreates, 0);
    // Reopen and explicitly accept; do not recreate media when someone leaves.
    h.emit('call:incoming', ongoing, {
      guest: true,
      participants: [peer, third],
      groupCall: true,
    });
    h.setRequest(async (event) =>
      event === 'call:accept'
        ? {
            ...credentials(ongoing),
            participants: [peer, third, me],
            groupCall: true,
          }
        : event === 'call:invite'
          ? {
              call: ongoing,
              invitedUserIds: ['friend'],
              participants: [peer, third, me],
              groupCall: true,
            }
          : {
              ...credentials(ongoing),
              caller: peer,
              guest: true,
              participants: [peer, third, me],
              groupCall: true,
            }
    );
    await h.value.accept();
    h.update({ ...mediaTypes.emptyMedia, joined: true, remoteJoined: true });
    assert.equal(h.value.active.phase, 'connected');
    assert.equal(await h.value.invite('friend'), true);
    assert.equal(h.commands.at(-1).payload.callId, ongoing.id);
    assert.equal(h.commands.at(-1).payload.userId, 'friend');
    h.emit('call:accepted', ongoing, {
      participantUserId: 'third',
      participants: [peer, me],
      groupCall: true,
    });
    assert.equal(h.value.active.phase, 'connected');
    assert.equal(h.value.active.participants.length, 2);
    assert.equal(h.mediaJoins, 1);
    assert.equal(h.mediaLeaves, 0);
    h.update({ ...mediaTypes.emptyMedia, joined: true });
    h.emit('call:accepted', ongoing, {
      participantUserId: 'peer',
      participants: [me],
      groupCall: true,
    });
    assert.equal(
      h.value.active.phase,
      'connected',
      'The last remaining participant can still add another friend'
    );
    h.value.sendMessage();
    await h.flush();
    assert.equal(
      h.navigations.at(-1).params.conversationId,
      'inviter-chat',
      'Guests must not navigate to the original private chat'
    );
    h.emit('call:ended', ongoing, {
      participantUserId: 'me',
      left: true,
      participants: [peer],
      groupCall: true,
    });
    assert.equal(
      h.value.active.phase,
      'ended',
      'Leaving ends only this local screen despite an ONGOING shared log'
    );
  }
  {
    const h = harness();
    const ongoing = record({ status: 'ONGOING', initiatorId: 'other' });
    h.setRequest(async () => ({
      call: ongoing,
      caller: peer,
      guest: true,
      expiresAt: new Date(Date.now() + 45000).toISOString(),
      participants: [peer],
    }));
    await h.value.sync();
    assert.equal(
      h.value.active.phase,
      'ringing',
      'An invitation missed while offline is recovered without joining'
    );
    h.emit('call:missed', ongoing, {
      participantUserId: 'me',
      invitationEnded: true,
    });
    assert.equal(h.value.active.phase, 'ended');
    assert.equal(h.mediaCreates, 0);
  }
  {
    const h = harness(),
      wait = deferred();
    h.setPermission(() => wait.promise);
    const start = h.value.start('chat', peer);
    await h.value.end();
    wait.resolve({ granted: true });
    await start;
    await h.flush();
    assert.equal(h.mediaCreates, 0);
    assert.ok(!h.commands.some((command) => command.event === 'call:invite'));
    assert.equal(h.value.active.phase, 'ended');
  }
  {
    const h = harness(),
      invite = deferred();
    h.setRequest((event) =>
      event === 'call:invite' ? invite.promise : Promise.resolve({ call: null })
    );
    const start = h.value.start('chat', peer);
    await h.flush();
    await h.value.end();
    invite.resolve(credentials(record()));
    await start;
    assert.equal(h.mediaCreates, 0);
    assert.ok(
      h.commands.some(
        (command) =>
          command.event === 'call:end' && command.payload.callId === 'one'
      )
    );
  }
  {
    const h = harness(),
      invite = deferred(),
      ringing = record(),
      ongoing = record({
        status: 'ONGOING',
        connectedAt: new Date().toISOString(),
      });
    h.setRequest((event) =>
      event === 'call:invite'
        ? invite.promise
        : Promise.resolve({ call: ongoing })
    );
    const start = h.value.start('chat', peer);
    await h.flush();
    h.emit('call:accepted', ongoing); // Arrives before the invite acknowledgement.
    invite.resolve(credentials(ringing));
    await start;
    await h.flush();
    h.update({ ...mediaTypes.emptyMedia, joined: true, remoteJoined: true });
    assert.equal(h.value.active.phase, 'connected');
    assert.equal(h.mediaJoins, 1);
    h.value.sendMessage();
    assert.equal(h.value.minimized, true);
    assert.equal(h.navigations.length, 1);
    h.value.restore();
    assert.equal(h.value.minimized, false);
    assert.equal(h.mediaLeaves, 0);
    h.emit(
      'call:ended',
      record({ status: 'COMPLETED', endedAt: new Date().toISOString() })
    );
    await h.flush();
    assert.equal(h.mediaLeaves, 1);
    assert.equal(h.value.active.phase, 'ended');
  }
  {
    const h = harness();
    h.emit('call:incoming', record({ initiatorId: 'peer' }));
    h.setPermission(async () => ({ granted: false }));
    h.setRequest(async () => ({
      call: record({ initiatorId: 'peer' }),
      caller: peer,
    }));
    await h.value.accept();
    await h.flush();
    assert.equal(h.mediaCreates, 0);
    assert.equal(h.value.active.phase, 'ringing');
    assert.ok(!h.commands.some((command) => command.event === 'call:accept'));
  }
  {
    const h = harness(),
      ongoing = record({
        initiatorId: 'peer',
        status: 'ONGOING',
        connectedAt: new Date().toISOString(),
      });
    h.emit('call:incoming', record({ initiatorId: 'peer' }));
    h.setRequest(async (event) => {
      if (event === 'call:accept') {
        h.emit('call:accepted', ongoing);
        throw new Error('Acknowledgement lost');
      }
      return { ...credentials(ongoing), caller: peer };
    });
    await h.value.accept();
    await h.flush();
    h.update({ ...mediaTypes.emptyMedia, joined: true, remoteJoined: true });
    assert.equal(h.mediaJoins, 1);
    assert.equal(h.value.active.phase, 'connected');
  }
  {
    const h = harness();
    h.emit('call:incoming', record({ initiatorId: 'peer' }));
    h.emit('call:accepted', record({ initiatorId: 'peer', status: 'ONGOING' }));
    assert.equal(h.value.active.notice, 'Answered on another device');
    assert.equal(h.mediaCreates, 0);
  }
  {
    const h = harness(),
      oldSync = deferred();
    h.setRequest((event) =>
      event === 'call:sync'
        ? oldSync.promise
        : Promise.resolve(credentials(record()))
    );
    const sync = h.value.sync();
    h.emit('call:incoming', record({ initiatorId: 'peer' }));
    oldSync.resolve({ call: null });
    await sync;
    assert.equal(
      h.value.active.phase,
      'ringing',
      'An old sync must not terminate a newer incoming call'
    );
  }
  {
    const h = harness();
    h.emit('call:incoming', record({ initiatorId: 'peer' }));
    h.emit(
      'call:ringing-timeout',
      record({ status: 'MISSED', endedAt: new Date().toISOString() })
    );
    assert.equal(h.value.active.notice, 'Missed call');
  }
}
async function nativeAdapter() {
  let remotes = [];
  const selfListeners = new Map(),
    participantListeners = new Map();
  let appListener,
    initialized,
    serviceStarts = 0,
    serviceStops = 0,
    released = 0,
    left = 0,
    route;
  const devices = [
    { deviceId: 'earpiece', kind: 'audiooutput' },
    { deviceId: 'speaker', kind: 'audiooutput' },
  ];
  const self = {
    roomJoined: false,
    audioEnabled: true,
    videoEnabled: false,
    videoTrack: { id: 'local' },
    on: (name, fn) => selfListeners.set(name, fn),
    removeListener: (name) => selfListeners.delete(name),
    getCurrentDevices: () => ({ speaker: route, video: { deviceId: 'front' } }),
    getSpeakerDevices: async () => devices,
    setDevice: async (device) => {
      route = device;
    },
    getVideoDevices: async () => [
      { deviceId: 'front', kind: 'videoinput' },
      { deviceId: 'back', kind: 'videoinput' },
    ],
    enableAudio: async () => {
      self.audioEnabled = true;
    },
    disableAudio: async () => {
      self.audioEnabled = false;
    },
    enableVideo: async () => {
      self.videoEnabled = true;
    },
    disableVideo: async () => {
      self.videoEnabled = false;
    },
  };
  const meeting = {
    self,
    participants: {
      joined: {
        toArray: () => remotes,
        on: (name, fn) => participantListeners.set(name, fn),
        removeListener: (name) => participantListeners.delete(name),
      },
    },
    joinRoom: async () => {
      self.roomJoined = true;
    },
    leaveRoom: async () => {
      left++;
    },
  };
  const adapter = load('lib/calls/media.native.ts', {
    'react-native': {
      Platform: { OS: 'android' },
      NativeModules: {
        WebRTCModule: {},
        RTKRNPermissions: {},
        EnveloCallService: {
          start: async () => {
            serviceStarts++;
          },
          stop: () => {
            serviceStops++;
          },
        },
      },
      AppState: {
        addEventListener: (_event, fn) => {
          appListener = fn;
          return {
            remove() {
              appListener = null;
            },
          };
        },
      },
    },
    '@cloudflare/realtimekit-react-native': {
      __esModule: true,
      default: {
        init: async (options) => {
          initialized = options;
          return meeting;
        },
      },
    },
    '@cloudflare/react-native-webrtc': {
      MediaStream: class {
        toURL() {
          return 'stream';
        }
        release() {
          released++;
        }
      },
    },
  });
  let media;
  const call = await adapter.createCallMedia(
    'test-only',
    (state) => {
      media = state;
    },
    () => {}
  );
  assert.equal(initialized.defaults.audio, true);
  assert.equal(initialized.defaults.video, false);
  await call.join();
  assert.equal(serviceStarts, 1);
  assert.equal(route.deviceId, 'earpiece');
  await call.speaker(true);
  assert.equal(media.speakerOn, true);
  assert.equal(route.kind, 'audiooutput');
  await call.microphone(false);
  assert.equal(media.microphoneOn, false);
  await call.camera(true);
  assert.equal(media.cameraOn, true);
  appListener('background');
  await Promise.resolve();
  assert.equal(self.videoEnabled, false);
  await call.flip();
  assert.equal(route.deviceId, 'back');
  remotes = [
    {
      id: 'sdk-c',
      userId: 'provider-c',
      customParticipantId: 'envelo:one:c',
      name: 'C',
      picture: 'https://example.invalid/c.png',
      videoEnabled: true,
      audioEnabled: true,
      videoTrack: { id: 'video-c' },
    },
    {
      id: 'sdk-d',
      userId: 'provider-d',
      customParticipantId: 'envelo:one:d',
      name: 'D',
      videoEnabled: false,
      audioEnabled: false,
    },
  ];
  participantListeners.get('participantJoined')();
  assert.equal(media.participants.length, 2);
  assert.equal(media.participants[0].userId, 'c');
  assert.equal(media.participants[0].video, 'stream');
  assert.equal(media.participants[1].video, null);
  assert.equal(media.participants[1].microphoneOn, false);
  remotes = remotes.slice(1);
  participantListeners.get('participantLeft')();
  assert.equal(media.participants.length, 1);
  assert.equal(
    released,
    1,
    'Leaving participant stream wrapper is released without stopping SDK tracks'
  );
  await call.leave();
  await call.leave();
  assert.equal(left, 1);
  assert.equal(serviceStops, 1);
  assert.equal(released, 2);
  assert.equal(selfListeners.size, 0);
  assert.equal(participantListeners.size, 0);
  assert.equal(appListener, null);
}
async function main() {
  const completed = record({
    status: 'COMPLETED',
    endedAt: new Date().toISOString(),
    durationSeconds: 12,
  });
  const merged = history.mergeCallHistory(
    [completed],
    [record(), record({ id: 'other', conversationId: 'other-chat' })],
    'chat',
    null
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'COMPLETED');
  assert.equal(
    history.mergeCallHistory([completed], [], 'chat', completed.createdAt)
      .length,
    0
  );
  assert.equal(contracts.durationLabel(65), '1:05');
  assert.equal(
    contracts.credentialsSchema.safeParse({ call: record() }).success,
    false
  );
  const plugin = require('../plugins/with-calling');
  const template = 'PackageList(this).packages.apply {\n}';
  assert.equal(
    plugin.configureApplication(plugin.configureApplication(template)),
    plugin.configureApplication(template)
  );
  const manifest = {
    manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] },
  };
  plugin.configureManifest(manifest);
  plugin.configureManifest(manifest);
  assert.equal(manifest.manifest.application[0].service.length, 1);
  assert.equal(
    manifest.manifest.application[0].service[0].$[
      'android:foregroundServiceType'
    ],
    'microphone'
  );
  await lifecycle();
  await nativeAdapter();
  await nativeConfiguration();
  console.log(
    'Calling UI checks passed: direct/group invitation recovery and isolation, individual leave, cancellation/late responses, minimizing, multi-participant native media/cleanup, history deduplication/cutoff, plugin idempotence.'
  );
}

async function nativeConfiguration() {
  const { compileModsAsync, withPlugins } = require('expo/config-plugins');
  const expo = JSON.parse(
    fs.readFileSync(path.join(root, 'app.json'), 'utf8')
  ).expo;
  const output = path.join(root, '.expo');
  fs.mkdirSync(output, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(output, 'calling-mod-check-'));
  try {
    // Use Expo's bundled SDK 54 template, including on a fresh clone without a
    // generated android/ folder. Preserve the developer's native checkout.
    await require('tar').x({
      file: path.join(root, 'node_modules/expo/template.tgz'),
      cwd: fixture,
      strip: 1,
      filter: (entry) => entry.startsWith('package/android/'),
    });
    const apply = () =>
      compileModsAsync(
        withPlugins({ ...expo, _internal: { projectRoot: root } }, [
          '@cloudflare/react-native-webrtc',
          '@cloudflare/realtimekit-react-native',
          require('../plugins/with-calling'),
        ]),
        { projectRoot: fixture, platforms: ['android'] }
      );
    await apply();
    await apply();
    const manifest = fs.readFileSync(
      path.join(fixture, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );
    assert.equal(
      (manifest.match(/com.envelo.calls.EnveloCallService/g) ?? []).length,
      1
    );
    assert.match(manifest, /android:foregroundServiceType="microphone"/);
    assert.match(manifest, /FOREGROUND_SERVICE_MICROPHONE/);
    assert.match(manifest, /BLUETOOTH_CONNECT/);
    const sourceRoot = path.join(fixture, 'android/app/src/main/java');
    const applicationFile = fs
      .readdirSync(sourceRoot, { recursive: true })
      .find((file) => file.endsWith('MainApplication.kt'));
    assert.ok(applicationFile);
    const application = fs.readFileSync(
      path.join(sourceRoot, applicationFile),
      'utf8'
    );
    assert.equal(
      (
        application.match(/add\(com.envelo.calls.EnveloCallPackage\(\)\)/g) ??
        []
      ).length,
      1
    );
    assert.ok(
      fs.existsSync(
        path.join(sourceRoot, 'com/envelo/calls/EnveloCallService.kt')
      )
    );
    assert.equal(
      (
        fs
          .readFileSync(
            path.join(fixture, 'android/app/proguard-rules.pro'),
            'utf8'
          )
          .match(/Envelo RealtimeKit/g) ?? []
      ).length,
      1
    );
    console.log(
      'Android calling config plugins passed twice on an isolated native template.'
    );
  } finally {
    const target = path.resolve(fixture);
    assert.equal(path.dirname(target), path.resolve(output));
    assert.ok(path.basename(target).startsWith('calling-mod-check-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
  assert.equal(
    fs.existsSync(fixture),
    false,
    'Native fixture is removed after verification'
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
