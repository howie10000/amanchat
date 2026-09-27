'use strict';
// Real-browser HTTP bandwidth per phase, via the Chrome DevTools Protocol.
//
// Drives headless Chrome/Edge (CHROME_PATH, or the usual install locations)
// against a throwaway local game server and records every request the page
// AND its workers make, with the bytes that actually crossed the wire
// (Network.loadingFinished.encodedDataLength: headers + compressed body).
//
// Phases:
//   cold      fresh profile, open the login screen, wait for the network to settle
//   town      register + log in, the town loads
//   warmup    background warmups the client schedules while idle in town
//   dungeon   open a guild run (the dungeon scene)
//   boss      walk into the guardian chamber: the boss rise cutscene
//   repeat    a second visit with the same profile: what is re-downloaded vs cached
//
// No npm dependencies: Node's built-in WebSocket talks CDP.
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { spawnServer, login, sleep } = require('./ws-sim.cjs');

function findBrowser() {
    const c = [process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
    return c.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

async function launch(profile) {
    const exe = findBrowser();
    if (!exe) throw new Error('No Chrome/Edge found; set CHROME_PATH');
    const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--window-size=1280,800',
        '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
    const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    const ws = new WebSocket('ws://127.0.0.1:' + port + wsPath);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map(); const listeners = [];
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
        for (const fn of listeners) fn(m);
    };
    const send = (method, params, sessionId) => new Promise((res, rej) => {
        const i = ++id; pending.set(i, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id: i, method, params: params || {}, sessionId }));
    });
    return { proc, send, on: fn => listeners.push(fn), close: async () => { try { await send('Browser.close'); } catch (e) {} try { proc.kill(); } catch (e) {} await sleep(500); } };
}

// A tab with request accounting for itself and every worker it starts.
async function openTab(b, log) {
    const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
    const sessions = new Set([sessionId]);
    const reqs = new Map();
    const ws = { up: 0, down: 0, frames: 0 };
    b.on(async (m) => {
        if (m.method === 'Target.attachedToTarget' && sessions.has(m.sessionId)) {
            const s = m.params.sessionId; sessions.add(s);
            try { await b.send('Network.enable', {}, s); await b.send('Network.setCacheDisabled', { cacheDisabled: false }, s); } catch (e) {}
            try { await b.send('Runtime.runIfWaitingForDebugger', {}, s); } catch (e) {}
            return;
        }
        if (!sessions.has(m.sessionId) || !m.method) return;
        const p = m.params || {}, key = m.sessionId + ':' + p.requestId;
        switch (m.method) {
            case 'Network.requestWillBeSent': {
                if (/^(data|blob):/.test(p.request.url)) return;
                const prev = reqs.get(key);
                // A redirect reuses the id; keep the first hop's bytes.
                reqs.set(key, { url: p.request.url, t: Date.now(), phase: log.phase, bytes: prev ? prev.bytes : 0, status: 0, cache: '', enc: '', type: p.type, worker: m.sessionId !== sessionId });
                break;
            }
            case 'Network.requestServedFromCache': { const r = reqs.get(key); if (r) r.cache = 'memory'; break; }
            case 'Network.responseReceived': {
                const r = reqs.get(key); if (!r) return;
                r.status = p.response.status;
                if (p.response.fromDiskCache) r.cache = 'disk';
                if (p.response.fromPrefetchCache) r.cache = 'prefetch';
                const h = p.response.headers || {};
                r.enc = h['content-encoding'] || h['Content-Encoding'] || '';
                r.cc = h['cache-control'] || h['Cache-Control'] || '';
                break;
            }
            case 'Network.loadingFinished': { const r = reqs.get(key); if (r) { r.bytes = p.encodedDataLength; r.done = true; } break; }
            case 'Network.loadingFailed': { const r = reqs.get(key); if (r) { r.failed = p.errorText; r.done = true; } break; }
            case 'Network.webSocketFrameSent': ws.up += (p.response.payloadData || '').length; ws.frames++; break;
            case 'Network.webSocketFrameReceived': ws.down += (p.response.payloadData || '').length; ws.frames++; break;
        }
    });
    await b.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
    await b.send('Network.enable', {}, sessionId);
    await b.send('Page.enable', {}, sessionId);
    await b.send('Runtime.enable', {}, sessionId);
    const evaluate = async (expr) => {
        const r = await b.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
        if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result.value;
    };
    const quiet = async (ms, max) => {
        const end = Date.now() + (max || 30000);
        while (Date.now() < end) {
            const last = Math.max(0, ...[...reqs.values()].map(r => r.t));
            const open = [...reqs.values()].some(r => !r.done && Date.now() - r.t < 20000);
            if (!open && Date.now() - last > ms) return;
            await sleep(200);
        }
    };
    return { targetId, sessionId, reqs, ws, evaluate, quiet, navigate: url => b.send('Page.navigate', { url }, sessionId), close: () => b.send('Target.closeTarget', { targetId }) };
}

const dbg = (...a) => { if (process.env.BW_DEBUG) console.error('[bw]', new Date().toISOString().slice(11, 19), ...a); };
const WARMUP_RE = /assets\/dark-sea\/[^/]+\.js|race-models\.js|race-preload-worker\.js/;
function summarise(tab, phase) {
    const list = [...tab.reqs.values()].filter(r => r.phase === phase);
    const net = list.filter(r => r.cache !== 'memory' && r.cache !== 'disk');
    const byUrl = new Map();
    for (const r of list) { const u = r.url.replace(/^https?:\/\/[^/]+/, ''); byUrl.set(u, (byUrl.get(u) || 0) + 1); }
    return {
        requests: list.length,
        network: net.length,
        fromCache: list.length - net.length,
        notModified: list.filter(r => r.status === 304).length,
        bytes: net.reduce((s, r) => s + (r.bytes || 0), 0),
        duplicates: [...byUrl].filter(([, n]) => n > 1).map(([u, n]) => u + ' x' + n),
        top: net.sort((a, b) => b.bytes - a.bytes).slice(0, 12).map(r => ({ url: r.url.replace(/^https?:\/\/[^/]+/, ''), bytes: r.bytes, status: r.status, enc: r.enc, worker: r.worker || undefined })),
    };
}

async function run(opts) {
    opts = opts || {};
    const port = opts.port || 18800 + Math.floor(Math.random() * 500);
    const srv = await spawnServer(port, Object.assign({ LOCAL_DEV_ID: 'bandwidth', DUNGEON_TEST_FAST: '1', DUNGEON_TEST_BOSS_HP: '40' }, opts.env || {}));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-chrome-'));
    const b = await launch(profile);
    const log = { phase: 'cold' };
    const out = {};
    const base = 'http://127.0.0.1:' + port + '/';
    let owner;
    try {
        owner = await login(port, 'bwowner');
        await owner.rpc('staff_unlock', { pass: 'pw123456' });
        let tab = await openTab(b, log);
        dbg('navigate'); await tab.navigate(base);
        await sleep(1500);
        dbg('boot'); await tab.evaluate('window.__gameBoot'); dbg('booted');
        await tab.quiet(2500, 60000);
        out.cold = summarise(tab, 'cold');

        log.phase = 'town'; dbg('town');
        const user = 'bwtab' + (Date.now() % 100000);
        await tab.evaluate(`document.getElementById('loginUser').value=${JSON.stringify(user)};document.getElementById('loginPass').value='pw123456';document.getElementById('btnRegister').click();true`);
        for (let i = 0; i < 100; i++) { if (await tab.evaluate(`document.getElementById('loginScreen').classList.contains('hidden')`)) break; await sleep(200); }
        const wsTown0 = { ...tab.ws };
        await sleep(3000);
        // Anything the idle scheduler starts from here on is a background warmup.
        log.phase = 'warmup'; dbg('warmup');
        await sleep(1000);
        await tab.quiet(8000, opts.warmupMs || 150000);
        out.town = summarise(tab, 'town');
        out.warmup = summarise(tab, 'warmup');
        // Background warmups that start inside the town window are still warmups.
        for (const r of tab.reqs.values()) if (r.phase === 'town' && WARMUP_RE.test(r.url)) r.phase = 'warmup';
        out.town = summarise(tab, 'town');
        out.warmup = summarise(tab, 'warmup');
        out.townWsPayload = { downBytes: tab.ws.down - wsTown0.down, upBytes: tab.ws.up - wsTown0.up };

        log.phase = 'dungeon'; dbg('dungeon');
        await owner.rpc('patch', { path: 'users/' + user, value: { money: 5000000 } });
        await tab.evaluate(`netGuild({action:'create',name:'Bandwidth Tab',tag:'BWT'}).then(()=>true)`);
        const ws0 = { ...tab.ws };
        await tab.evaluate(`gameCombat.startDungeon('guild_crypt').then(()=>!!state.dungeon)`);
        await sleep(6000);
        await tab.quiet(2000, 20000);
        out.dungeon = summarise(tab, 'dungeon');
        out.dungeonWsPayload = { downBytes: tab.ws.down - ws0.down, upBytes: tab.ws.up - ws0.up, seconds: 6 };

        log.phase = 'boss'; dbg('boss');
        const ws1 = { ...tab.ws };
        await tab.evaluate(`(()=>{const p=state.dungeon.world,r=p.mini,e=r.entry||{x:r.x+512,y:r.y+640};state.pos.x=e.x;state.pos.y=e.y;return true})()`);
        let entered = false;
        for (let i = 0; i < 60 && !entered; i++) { await sleep(250); entered = await tab.evaluate(`!!(state.dungeon&&state.dungeon.bossRoom)`); }
        out.bossEntered = entered;
        await sleep(9000);
        await tab.quiet(2000, 20000);
        out.boss = summarise(tab, 'boss');
        out.bossWsPayload = { downBytes: tab.ws.down - ws1.down, upBytes: tab.ws.up - ws1.up, seconds: 9 };
        await tab.close();

        log.phase = 'repeat'; dbg('repeat');
        tab = await openTab(b, log);
        dbg('navigate'); await tab.navigate(base);
        await sleep(1500);
        dbg('boot'); await tab.evaluate('window.__gameBoot'); dbg('booted');
        await tab.quiet(2500, 60000);
        out.repeat = summarise(tab, 'repeat');
        await tab.close();
    } finally {
        if (owner) owner.close();
        await b.close();
        await srv.kill();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }
    return out;
}

module.exports = { run, findBrowser };

if (require.main === module) {
    run().then(r => console.log(JSON.stringify(r, null, 1))).catch(e => { console.error(e); process.exit(1); });
}
