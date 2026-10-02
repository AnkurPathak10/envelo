const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (code) =>
  ts.transpileModule(code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const jsx = (type, props) => ({ type, props });
let preference = 'system';
let bottom = 0;
let windowWidth = 390;
let fontScale = 1;
const selections = [];
const tokensModule = { exports: {} };
vm.runInNewContext(compile(read('constants/theme.ts')), {
  exports: tokensModule.exports,
});
const tokens = tokensModule.exports;
function load(file, extra = '') {
  const module = { exports: {} };
  vm.runInNewContext(compile(read(file)) + extra, {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react') return { useState: (value) => [value, () => {}] };
      if (id === 'react-native')
        return {
          Pressable: 'Pressable',
          Modal: 'Modal',
          ScrollView: 'ScrollView',
          Text: 'Text',
          View: 'View',
          useWindowDimensions: () => ({ width: windowWidth, fontScale }),
          StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
        };
      if (id === 'react-native-safe-area-context')
        return { useSafeAreaInsets: () => ({ bottom, top: 24 }) };
      if (id === '@/constants/theme') return tokens;
      if (id === '@/lib/navigation/floatingTabs')
        return load('lib/navigation/floatingTabs.ts');
      if (id === '@/lib/theme/ThemeContext')
        return {
          useAppTheme: () => ({
            preference,
            colorScheme: 'dark',
            setPreference: async (value) => {
              selections.push(value);
            },
          }),
        };
      if (id === '@/lib/theme/useAppColorScheme')
        return { useAppColorScheme: () => 'dark' };
      if (id === '@/lib/auth/AuthContext')
        return { useAuth: () => ({ user: null }) };
      if (id === '@/lib/conversations/InboxBadgeContext')
        return { useInboxBadge: () => ({ unreadCount: 0 }) };
      if (id === '@/lib/friends/FriendRequestsContext')
        return { useFriendRequests: () => ({ requests: [] }) };
      if (id === '@react-navigation/elements')
        return { PlatformPressable: 'PlatformPressable' };
      if (id === 'expo-router')
        return { Tabs: Object.assign(() => {}, { Screen: 'Tabs.Screen' }) };
      if (id === '@react-navigation/native')
        return { getFocusedRouteNameFromRoute: (route) => route.name };
      return {};
    },
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
async function verifyReadAll() {
  const home = read('app/(app)/(tabs)/chats/index.tsx');
  const tree = ts.createSourceFile(
    'home.tsx',
    home,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'readAll')
      handler = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(handler);
  const baseline = ['ok', 'failed', 'new-arrival'].map((id) => ({
    id,
    unreadCount: 2,
    lastMessage: { id: id + '-message' },
  }));
  const requests = new Map();
  let current = baseline;
  let error = null;
  let busy = false;
  const context = vm.createContext({
    isReadingAll: false,
    isMounted: { current: true },
    conversationsRef: { current: baseline },
    setMenuOpen: () => {},
    setIsReadingAll: (value) => {
      busy = value;
    },
    setMenuError: (value) => {
      error = value;
    },
    markConversationRead: ({ conversationId, upToMessageId }) => {
      assert.equal(upToMessageId, conversationId + '-message');
      const request = deferred();
      requests.set(conversationId, request);
      return request.promise;
    },
    updateLiveConversations: (update) => {
      current = update(current);
    },
  });
  vm.runInContext(compile(`globalThis.readAll = ${handler};`), context);
  const done = context.readAll();
  assert.equal(busy, true);
  assert.equal(
    current[0].unreadCount,
    2,
    'do not mark read before server confirmation'
  );
  current = current.map((item) =>
    item.id === 'new-arrival'
      ? { ...item, unreadCount: 3, lastMessage: { id: 'new-message' } }
      : item
  );
  requests.get('ok').resolve({ success: true });
  requests.get('failed').resolve({ success: false, error: 'disconnected' });
  requests.get('new-arrival').resolve({ success: true });
  await done;
  assert.equal(current[0].unreadCount, 0);
  assert.equal(current[1].unreadCount, 2);
  assert.equal(
    current[2].unreadCount,
    3,
    'concurrent new messages remain unread'
  );
  assert.ok(error);
  assert.equal(busy, false);
}

async function main() {
  const theme = load('components/theme/theme-toggle.tsx');
  for (preference of ['light', 'dark', 'system']) {
    let closed = false;
    const picker = theme.ThemePicker({
      visible: true,
      onClose: () => {
        closed = true;
      },
    });
    assert.equal(picker.props.actions.length, 3);
    assert.equal(
      picker.props.actions.filter((action) => action.selected).length,
      1
    );
    const selected = picker.props.actions.find((action) => action.selected);
    selected.onPress();
    assert.equal(selections.at(-1), preference);
    assert.equal(closed, true);
    const toggle = theme.ThemeToggle();
    assert.equal(
      toggle.props.children[0].props.accessibilityLabel,
      `Appearance, ${theme.themeLabels[preference]}. Change theme`
    );
  }
  const tabs = load(
    'app/(app)/(tabs)/_layout.tsx',
    '\nexports.TabNavigator = TabNavigator; exports.RoundedTabButton = RoundedTabButton;'
  );
  const screens = tabs.TabNavigator().props.children;
  for (const index of [0, 2]) {
    const options = screens[index].props.options;
    assert.equal(
      options({ route: { name: 'index' } }).tabBarStyle.position,
      'absolute'
    );
    assert.equal(
      options({ route: { name: 'nested-screen' } }).tabBarStyle.display,
      'none',
      'nested chat/profile screens still hide the footer'
    );
  }
  for (bottom of [0, 24, 48]) {
    for (windowWidth of [320, 390, 768]) {
      for (fontScale of [1, 1.6, 2]) {
        const renderedTabs = tabs.TabNavigator();
        const options = renderedTabs.props.screenOptions;
        assert.equal(options.tabBarLabelPosition, 'below-icon');
        const style = options.tabBarStyle;
        assert.equal(
          style.position,
          'absolute',
          'the footer floats over content'
        );
        assert.ok(
          style.left >= 20 && style.right >= 20,
          'both screen edges remain visible'
        );
        assert.ok(
          windowWidth - style.left - style.right <= 360,
          'footer width remains compact on tablets'
        );
        assert.equal(
          style.bottom,
          bottom + 12,
          'float above the device navigation area'
        );
        assert.equal(
          renderedTabs.props.safeAreaInsets.bottom,
          0,
          'avoid double-insetting the pill'
        );
        assert.ok(style.height - style.paddingTop - style.paddingBottom >= 52);
        if (fontScale === 1)
          assert.equal(style.height, 64, 'compact default height');
        assert.equal(options.tabBarLabelStyle.fontSize, 11);
        const button = tabs.RoundedTabButton({
          style: { backgroundColor: 'selected', borderRadius: 0 },
          children: ['icon', 'label'],
        });
        assert.ok(
          button.props.style.at(-1).borderRadius >= 24,
          'round the actual selected button, not only its wrapper'
        );
        assert.equal(button.props.children.length, 2);
      }
    }
  }
  await verifyReadAll();
  console.log(
    'UI polish checks passed: theme choices, compact floating tabs across screen widths/safe areas/font sizes, read-all acknowledgements/failures and concurrent messages.'
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
