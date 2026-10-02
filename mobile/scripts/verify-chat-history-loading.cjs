// Execute the actual screen effects with deferred storage/network responses.
// No server data, accounts, or native build is changed by these regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'components/chat/chat-screen.tsx'),
  'utf8'
);
const tree = ts.createSourceFile(
  'chat-screen.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const effects = [];
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === 'useEffect'
  )
    effects.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const historyEffect = effects.find((node) =>
  node.arguments[1]?.getText(tree).includes('reloadVersion')
);
const connectionEffect = effects.find(
  (node) => node.arguments[1]?.getText(tree) === '[connectionEpoch]'
);
assert.ok(historyEffect && connectionEffect);
assert.match(source, /useState<InitialHistoryState>\('checking-cache'\)/);
assert.match(
  source,
  /if \(initialState === 'checking-cache'\)[\s\S]*?return <View style=\{styles.container\} \/>;/
);

function compile(code) {
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}
const mergeModule = { exports: {} };
vm.runInNewContext(
  compile(fs.readFileSync(path.join(root, 'lib/chat/messages.ts'), 'utf8')),
  {
    module: mergeModule,
    exports: mergeModule.exports,
    require: () => ({}),
  }
);
const helpers = tree.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      [
        'isAfterConversationCutoff',
        'afterLocalCutoff',
        'newestCutoff',
        'historyErrorMessage',
      ].includes(node.name?.text)
  )
  .map((node) => node.getText(tree))
  .join('\n');
const effectCode = compile(`${helpers}
globalThis.runHistoryEffect = ${historyEffect.arguments[0].getText(tree)};
globalThis.runConnectionEffect = ${connectionEffect.arguments[0].getText(tree)};`);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise(setImmediate);
};
const message = (id) => ({
  id,
  conversationId: 'chat',
  senderId: 'friend',
  content: id,
  mediaUrl: null,
  status: null,
  createdAt: '2026-10-02T10:00:00.000Z',
});
const page = (...ids) => ({
  clearedAt: null,
  nextCursor: null,
  messages: ids.map(message),
});

// Render the real component's JSX with hooks/platform integrations stubbed.
// The effect-only tests below cannot catch a second, post-load layout spinner.
const stateNames = [];
function collectStateNames(node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isArrayBindingPattern(node.name) &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    node.initializer.expression.getText(tree) === 'useState'
  ) {
    stateNames.push(node.name.elements[0].getText(tree));
  }
  ts.forEachChild(node, collectStateNames);
}
collectStateNames(tree);
function renderScreen(overrides, renderSource = source) {
  let stateIndex = 0;
  const noop = () => {};
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    useState: (initial) => {
      const name = stateNames[stateIndex++];
      const value = Object.hasOwn(overrides, name)
        ? overrides[name]
        : typeof initial === 'function'
          ? initial()
          : initial;
      return [value, noop];
    },
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
    useRef: (current) => ({ current }),
    useEffect: noop,
  };
  const native = {
    Platform: { OS: 'android' },
    AppState: { currentState: 'active' },
    StyleSheet: { create: (styles) => styles },
    ActivityIndicator: 'ActivityIndicator',
    FlatList: 'FlatList',
    Pressable: 'Pressable',
    Text: 'Text',
    View: 'View',
  };
  const compiled = ts.transpileModule(renderSource, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const renderedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: renderedModule,
    exports: renderedModule.exports,
    require: (id) => {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react-native') return native;
      if (id === '@react-navigation/native')
        return { useFocusEffect: noop, useIsFocused: () => true };
      if (id === 'react-native-keyboard-controller')
        return {
          KeyboardStickyView: 'KeyboardStickyView',
          useKeyboardController: () => ({ setEnabled: noop }),
        };
      if (id === 'react-native-safe-area-context')
        return { SafeAreaView: 'SafeAreaView' };
      if (id === '@/constants/theme')
        return { messagingColors: { light: {}, dark: {} }, radius: {} };
      if (id === '@/lib/auth/AuthContext')
        return { useAuth: () => ({ user: { id: 'me' } }) };
      if (id === '@/lib/theme/useAppColorScheme')
        return { useAppColorScheme: () => 'light' };
      if (id === '@/lib/socket/SocketContext')
        return {
          useSocket: () => ({
            pendingMessages: [],
            connectionEpoch: 0,
            connectionState: 'connecting',
          }),
        };
      return {};
    },
  });
  return renderedModule.exports.ChatScreen({ conversationId: 'chat' });
}
function countSpinners(node) {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node))
    return node.reduce((sum, child) => sum + countSpinners(child), 0);
  const empty =
    node.type === 'FlatList' && node.props.data.length === 0
      ? node.props.ListEmptyComponent
      : null;
  return (
    Number(node.type === 'ActivityIndicator') +
    countSpinners(node.props?.children) +
    countSpinners(empty)
  );
}
function verifyRenderedLoading() {
  for (const messages of [page('saved').messages, []]) {
    for (const ready of [false, true]) {
      assert.equal(
        countSpinners(
          renderScreen({
            messages,
            initialState: 'loaded',
            isInitialPositionReady: ready,
          })
        ),
        0,
        'a loaded chat must have no spinner, even while positioning'
      );
    }
  }
  assert.equal(
    countSpinners(renderScreen({ initialState: 'checking-cache' })),
    0
  );
  assert.equal(
    countSpinners(renderScreen({ initialState: 'loading' })),
    1,
    'an uncached first load has exactly one spinner'
  );
  // Prove this rendered-screen check detects the exact regression we missed.
  const oldOverlay = source.replace(
    '      <FlatList\n',
    '      {!isInitialPositionReady ? <ActivityIndicator /> : null}\n      <FlatList\n'
  );
  assert.equal(
    countSpinners(
      renderScreen(
        {
          messages: page('saved').messages,
          initialState: 'loaded',
          isInitialPositionReady: false,
        },
        oldOverlay
      )
    ),
    1
  );
}

function screen() {
  const cache = deferred();
  const requests = [];
  const states = ['checking-cache'];
  const state = {
    messages: [],
    cursor: null,
    offline: false,
    error: null,
    cacheReads: 0,
    scrolls: 0,
  };
  const update = (key) => (value) => {
    state[key] = typeof value === 'function' ? value(state[key]) : value;
  };
  class ApiError extends Error {
    constructor(status) {
      super('HTTP error');
      this.status = status;
    }
  }
  const context = vm.createContext({
    ApiError,
    conversationId: 'chat',
    user: { id: 'me' },
    hiddenBefore: null,
    isGroup: false,
    connectionEpoch: 0,
    observedConnectionEpoch: { current: 0 },
    loadedConversationId: { current: null },
    refreshHistoryRef: { current: null },
    pendingMessagesRef: { current: [] },
    setInitialState: (value) => {
      states.push(value);
    },
    setInitialError: update('error'),
    setIsOffline: update('offline'),
    setMessages: update('messages'),
    setNextCursor: update('cursor'),
    getCachedMessageHistory: () => {
      state.cacheReads++;
      return cache.promise;
    },
    getMessageHistory: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
    cacheMessageHistoryPage: async () => {},
    removeCachedMessageHistory: async () => {},
    acknowledgeDeliveredMessages: () => {},
    normalizeGroupStatuses: (items) => items,
    mergeTextMessages: mergeModule.exports.mergeTextMessages,
    isConnectivityError: (error) =>
      error instanceof ApiError && error.status === 0,
    requestScrollToEnd: () => {
      state.scrolls++;
    },
  });
  vm.runInContext(effectCode, context);
  const cleanup = context.runHistoryEffect();
  return {
    cache,
    requests,
    states,
    state,
    context,
    cleanup,
    connect: () => {
      context.connectionEpoch++;
      context.runConnectionEffect();
    },
  };
}

async function main() {
  verifyRenderedLoading();
  // First-ever open: one spinner, even if first connect races initial REST.
  for (const catchUpFirst of [false, true]) {
    const s = screen();
    s.cache.resolve(null);
    await settle();
    assert.equal(s.states.filter((value) => value === 'loading').length, 1);
    s.connect();
    await settle();
    assert.equal(s.requests.length, 2);
    s.requests[catchUpFirst ? 1 : 0].resolve(page('one'));
    await settle();
    assert.equal(s.states.at(-1), 'loaded');
    assert.equal(
      s.state.scrolls,
      1,
      'first data is revealed at the newest message'
    );
    s.requests[catchUpFirst ? 0 : 1].resolve(page('one', 'two'));
    await settle();
    assert.equal(s.states.filter((value) => value === 'loading').length, 1);
    assert.equal(
      s.state.messages.length,
      2,
      'overlapping REST/catch-up IDs are de-duplicated'
    );
    s.connect();
    s.requests[2].resolve(page('two', 'three'));
    await settle();
    assert.equal(s.state.messages.length, 3);
    assert.equal(s.state.scrolls, 1, 'reconnect never forces scrolling');
    assert.equal(
      s.state.cacheReads,
      1,
      'connect does not restart cache restoration'
    );
    s.cleanup();
  }

  // Repeated cached opens: no spinner before, during, or after background work.
  // Empty cached histories are also valid first data.
  for (const cached of [page('saved'), page()]) {
    for (let revisit = 0; revisit < 5; revisit++) {
      const s = screen();
      s.connect(); // first connection arrives while AsyncStorage is unresolved
      s.cache.resolve(cached);
      await settle();
      assert.equal(s.states.at(-1), 'loaded');
      assert.equal(s.state.messages.length, cached.messages.length);
      s.requests[1].resolve(page('fresh'));
      await settle();
      s.requests[0].resolve(page('fresh'));
      await settle();
      s.connect();
      s.requests[2].reject(new s.context.ApiError(0));
      await settle();
      assert.equal(s.state.offline, true);
      assert.equal(
        s.states.includes('loading'),
        false,
        'cached revisit must never block'
      );
      assert.equal(
        new Set(s.state.messages.map((item) => item.id)).size,
        s.state.messages.length
      );
      s.cleanup();
    }
  }

  // Catch-up can deliver data even before the cache check has completed.
  const early = screen();
  early.connect();
  early.requests[1].resolve(page('early'));
  await settle();
  early.cache.resolve(null);
  early.requests[0].resolve(page('early'));
  await settle();
  assert.equal(early.states.includes('loading'), false);
  early.cleanup();

  // A silent refresh must keep the cursor for already-restored older pages.
  const paginated = screen();
  paginated.cache.resolve({ ...page('saved'), nextCursor: 'older-cached' });
  await settle();
  paginated.connect();
  paginated.requests[1].resolve({
    ...page('fresh'),
    nextCursor: 'latest-page',
  });
  await settle();
  assert.equal(paginated.state.cursor, 'older-cached');
  paginated.requests[0].resolve({
    ...page('fresh'),
    nextCursor: 'latest-page',
  });
  await settle();
  paginated.cleanup();

  // Preserve Feature 15's explicit HTTP error behavior, but retries cannot
  // reintroduce a spinner once cached content has been restored.
  const httpError = screen();
  httpError.cache.resolve(page('saved'));
  await settle();
  httpError.requests[0].reject(new httpError.context.ApiError(500));
  await settle();
  assert.equal(httpError.states.at(-1), 'error');
  httpError.cleanup();
  const retryCleanup = httpError.context.runHistoryEffect();
  await settle();
  httpError.requests[1].resolve(page('saved', 'fresh'));
  await settle();
  assert.equal(httpError.states.at(-1), 'loaded');
  assert.equal(httpError.states.includes('loading'), false);
  retryCleanup();

  // No cache + failed initial REST still exposes the initial error, not blank UI.
  const failed = screen();
  failed.cache.resolve(null);
  failed.requests[0].reject(new failed.context.ApiError(0));
  await settle();
  assert.equal(failed.states.at(-1), 'error');
  failed.cleanup();

  // Leaving the screen prevents late responses from changing its rendered data.
  const closed = screen();
  closed.cleanup();
  closed.cache.resolve(page('saved'));
  closed.requests[0].resolve(page('fresh'));
  await settle();
  assert.equal(closed.state.messages.length, 0);
  console.log(
    'Chat loading regressions passed: rendered-screen spinner checks (including layout positioning), cold socket races, cached/empty revisits, silent reconnects, durable-ID merging, initial error, and unmount.'
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
