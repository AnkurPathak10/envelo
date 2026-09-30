const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'cache', 'conversationCache.ts'),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const values = new Map();
const storage = {
  getItem: async (key) => values.get(key) ?? null,
  removeItem: async (key) => values.delete(key),
  setItem: async (key, value) => values.set(key, value),
};
const cacheModule = { exports: {} };
vm.runInNewContext(compiled, {
  Date,
  JSON,
  Promise,
  exports: cacheModule.exports,
  module: cacheModule,
  require: (id) => {
    assert.equal(id, '@react-native-async-storage/async-storage');
    return { __esModule: true, default: storage };
  },
});

const key = 'envelo_conversation_list_v1:account-1';
const legacyDirect = {
  id: 'conversation-1',
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  clearedAt: null,
  lastMessage: null,
  unreadCount: 0,
  participant: {
    id: 'friend-1',
    displayName: 'Ravi',
    email: 'ravi@example.com',
    avatarUrl: null,
  },
};

async function main() {
  const { participant: _participant, ...base } = legacyDirect;
  const group = { ...base, type: 'GROUP', name: 'Team', photoUrl: null };
  values.set(
    key,
    JSON.stringify({
      userId: 'account-1',
      cachedAt: '2026-09-30T10:00:00.000Z',
      conversations: [legacyDirect, group],
    })
  );
  const restored =
    await cacheModule.exports.getCachedConversations('account-1');
  assert.equal(restored.length, 2);
  assert.equal(restored[0].type, 'DIRECT');
  assert.equal(restored[0].participant.id, 'friend-1');
  assert.equal(restored[1].type, 'GROUP');
  assert.equal(restored[1].name, 'Team');
  assert.equal(values.has(key), true, 'valid legacy cache must not be deleted');

  values.set(
    key,
    JSON.stringify({
      userId: 'account-1',
      cachedAt: '2026-09-30T10:00:00.000Z',
      conversations: [{ ...legacyDirect, type: 'UNKNOWN' }],
    })
  );
  assert.equal(
    await cacheModule.exports.getCachedConversations('account-1'),
    null
  );
  assert.equal(values.has(key), false, 'invalid cache must be discarded');
  console.log('Legacy direct-conversation cache normalization passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
