import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.APP_ENC_KEY = randomBytes(32).toString('base64');

test('confirmation text ignores spaces and case', async () => {
  const { confirmMatches, normalizeConfirm } = await import('../src/lib/backup-core');
  assert.equal(normalizeConfirm(' Find IT '), 'findit');
  assert.ok(confirmMatches('findit'));
  assert.ok(confirmMatches('  FINDIT '));
  assert.ok(!confirmMatches('finditx'));
  assert.ok(!confirmMatches(''));
});

test('snapshot pack/unpack roundtrip and counts', async () => {
  const { packSnapshot, unpackSnapshot, countsOf, TABLES } = await import('../src/lib/backup-core');
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) tables[t.name] = [];
  tables[TABLES[0].name] = [{ a: 1 }, { a: 2 }];
  const { data, counts } = packSnapshot(tables);
  assert.equal(counts[TABLES[0].name], 2);
  const snap = unpackSnapshot(data);
  assert.deepEqual(countsOf(snap.tables), counts);
});

test('garbage is rejected', async () => {
  const { unpackSnapshot } = await import('../src/lib/backup-core');
  assert.throws(() => unpackSnapshot(Buffer.from('not a backup')));
});

test('sha256 and byte formatting', async () => {
  const { sha256Hex, fmtBytes } = await import('../src/lib/backup-core');
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(fmtBytes(1536), /1\.5 KB/);
});
