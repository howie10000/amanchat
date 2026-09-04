// bcrypt worker — one message in, one message out.
// bcryptjs is pure JS, so a cost-10 hash is ~120ms of solid CPU. On the main
// thread that's 120ms where nothing else on the server runs (and a reconnect
// storm after a restart serialises every login). Out here it lands on one of
// the otherwise-idle cores instead.
'use strict';
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', (m) => {
    try {
        if (m.op === 'hash') parentPort.postMessage({ id: m.id, ok: true, value: bcrypt.hashSync(m.pass, m.rounds || 10) });
        else if (m.op === 'compare') parentPort.postMessage({ id: m.id, ok: true, value: bcrypt.compareSync(m.pass, m.hash) });
        else parentPort.postMessage({ id: m.id, ok: false, err: 'unknown op' });
    } catch (e) {
        parentPort.postMessage({ id: m.id, ok: false, err: (e && e.message) || String(e) });
    }
});
