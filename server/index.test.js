import { Matchmaker } from './matchmaker.js';

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function test(name, fn) {
  const log = [];
  const mm = new Matchmaker({ send: (id, msg) => log.push({ id, msg }), timeoutMs: 40 });
  await fn(mm, log, assert);
  console.log(`ok - ${name}`);
}

await test('two queued clients: first becomes host, second hears nothing yet', async (mm, log) => {
  mm.queue('a', 'Alice');
  mm.queue('b', 'Bob');
  assert(log.length === 1, 'exactly one message sent on pairing');
  assert(log[0].id === 'a' && log[0].msg.role === 'host', 'the first queued client is told host');
});

await test('host ready() tells the guest the code', async (mm, log) => {
  mm.queue('a', 'Alice');
  mm.queue('b', 'Bob');
  mm.ready('a', 'WXYZ');
  const toGuest = log.find((l) => l.id === 'b');
  assert(toGuest && toGuest.msg.type === 'role' && toGuest.msg.role === 'guest' && toGuest.msg.code === 'WXYZ',
    'guest receives role:guest with the host-chosen code');
});

await test('a lone queued client times out', async (mm, log) => {
  mm.queue('a', 'Alice');
  await wait(80);
  assert(log.some((l) => l.id === 'a' && l.msg.type === 'timeout'), 'lone client gets a timeout message');
});

await test('host failing before ready requeues the guest', async (mm, log) => {
  mm.queue('a', 'Alice');
  mm.queue('b', 'Bob');
  mm.hostFailed('a');
  assert(log.some((l) => l.id === 'b' && l.msg.type === 'requeue'), 'guest is told to requeue');
  // Guest requeuing should be able to pair again with someone new.
  mm.queue('b', 'Bob');
  mm.queue('c', 'Carol');
  const toB = log.filter((l) => l.id === 'b').pop();
  assert(toB.msg.type === 'role' && toB.msg.role === 'host', 'previously-guest client can become host on a fresh pairing');
});

await test('disconnect while paired requeues the partner', async (mm, log) => {
  mm.queue('a', 'Alice');
  mm.queue('b', 'Bob');
  mm.disconnect('a');
  assert(log.some((l) => l.id === 'b' && l.msg.type === 'requeue'), 'partner requeued on disconnect');
});

await test('cancel removes a client from the queue without pairing it later', async (mm, log) => {
  mm.queue('a', 'Alice');
  mm.cancel('a');
  mm.queue('b', 'Bob');
  await wait(80);
  assert(log.every((l) => l.id !== 'a'), 'canceled client never hears from the relay again');
  assert(log.some((l) => l.id === 'b' && l.msg.type === 'timeout'), 'the remaining lone client still times out on its own');
});

if (process.exitCode) {
  console.error('Matchmaker self-test FAILED');
} else {
  console.log('OK — matchmaker self-test passed');
}
