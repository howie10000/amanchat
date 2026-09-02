// Bank v2: vault deposits + auto-interest, credit score and loans.
//   * pure-function checks on ECON (bankAccrue / loanAccrue / loanLimit / …)
//   * end-to-end checks driving the live server's `bank` op over the WS RPC
//
//   node bank.test.js [path/to/dir/with/node_modules] [port]

'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MODS = path.resolve(process.argv[2] || __dirname);
const PORT = +(process.argv[3] || 18456);
const WebSocket = require(path.join(MODS, 'node_modules', 'ws'));
const ECON = require(path.join(__dirname, '..', 'js', 'shared', 'economy.js'));

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('  ok  ' + msg); } else { fails++; console.log('  FAIL ' + msg); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ pure logic
console.log('ECON.bankAccrue');
{
  const now = 1_000_000_000_000;
  ok(ECON.bankAccrue(0, now - 999999, now).gained === 0, 'empty vault earns nothing');
  ok(ECON.bankAccrue(1000, now, now).gained === 0, 'no time passed → no interest');
  const one = ECON.bankAccrue(10000, now - ECON.BANK_INTEREST_PERIOD, now);
  ok(one.gained === 10 && one.balance === 10010, 'one 5-min period on $10,000 = +$10 (0.1%)');
  const three = ECON.bankAccrue(10000, now - 3 * ECON.BANK_INTEREST_PERIOD, now);
  ok(three.balance === Math.floor(10000 * Math.pow(1.001, 3)), 'three periods compound');
  const partial = ECON.bankAccrue(10000, now - ECON.BANK_INTEREST_PERIOD - 60000, now);
  ok(partial.last === now - 60000, 'last advances by whole periods only (60s of progress kept)');
  const capped = ECON.bankAccrue(1000, now - ECON.BANK_INTEREST_PERIOD * (ECON.BANK_INTEREST_MAX_PERIODS + 500), now);
  ok(capped.balance === Math.floor(1000 * Math.pow(1.001, ECON.BANK_INTEREST_MAX_PERIODS)), 'compounding is capped');
}

console.log('ECON credit + loans');
{
  ok(ECON.clampCredit(9999) === ECON.CREDIT_MAX && ECON.clampCredit(-5) === ECON.CREDIT_MIN, 'credit clamps to 300..850');
  ok(ECON.loanRate(ECON.CREDIT_MAX) < ECON.loanRate(ECON.CREDIT_MIN), 'better credit → lower rate');
  ok(ECON.loanRate(300) <= 0.45 && ECON.loanRate(850) >= 0.05, 'rate stays in a sane band');
  ok(ECON.loanLimit(850, 0) > ECON.loanLimit(300, 0), 'better credit → bigger ceiling');
  ok(ECON.loanLimit(600, 100000) > ECON.loanLimit(600, 0), 'net worth lifts the ceiling');
  // The ceiling is a modest multiple of net worth, not many times it.
  ok(ECON.loanLimit(600, 20000) <= 20000 * 1.5, 'a fair-credit loan cannot far exceed net worth');
  ok(ECON.loanLimit(850, 20000) <= 20000 * 1.6, 'even great credit stays near ~1.5x net worth');
  ok(ECON.loanLimit(600, 300) < 2000, 'a broke player only gets a small starter loan');
  ok(ECON.furnitureResaleValue(1000) === 500 && ECON.furnitureResaleValue(1) >= 1, 'furniture resells at half, min $1');
  ok(ECON.loanTotalDue(1000, 600) === 1000 + Math.ceil(1000 * ECON.loanRate(600)), 'total due = principal + flat interest');

  // Credit gains are hard to move now.
  ok(ECON.loanRepayCreditGain(100, true, true, 600) === 0, 'a token $100 loan repaid on time builds NO credit');
  ok(ECON.loanRepayCreditGain(5000, true, true, 600) > ECON.loanRepayCreditGain(1000, true, true, 600), 'bigger loans build more credit');
  ok(ECON.loanRepayCreditGain(5000, true, true, 600) <= 14, 'even a big early on-time repay is a single-digit / low gain');
  ok(ECON.loanRepayCreditGain(5000, true, true, 830) < ECON.loanRepayCreditGain(5000, true, true, 600), 'gains shrink as the score climbs toward 850');
  ok(ECON.loanRepayCreditGain(5000, false, false, 600) < ECON.loanRepayCreditGain(5000, true, false, 600), 'a late payoff is worth less than an on-time one');

  const now = 2_000_000_000_000;
  const fresh = { principal: 1000, owed: 1250, rate: 0.25, takenTs: now - 1000, dueTs: now + 3600000, latePeriods: 0 };
  ok(ECON.loanAccrue(fresh, 600, now).newLate === 0, 'a loan that is not due yet takes no penalty');
  const overdue = { principal: 1000, owed: 1000, rate: 0.25, takenTs: now - ECON.LOAN_TERM, dueTs: now - ECON.LOAN_LATE_PERIOD * 2, latePeriods: 0 };
  const la = ECON.loanAccrue(overdue, 600, now);
  ok(la.newLate === 3, 'two full late periods past due counts as 3 (one the instant it lapses)');
  ok(la.loan.owed === Math.ceil(Math.ceil(Math.ceil(1000 * 1.08) * 1.08) * 1.08), 'owed compounds 8% per late period');
  ok(la.credit === ECON.clampCredit(600 - 3 * 25), 'credit drops 25 per late period');
  const la2 = ECON.loanAccrue(la.loan, la.credit, now);
  ok(la2.newLate === 0, 'already-counted late periods are not charged twice');
}

// ------------------------------------------------------------------ end to end
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nbh-bank-'));
const dbPath = path.join(tmp, 'test.db');
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: dbPath, STATIC_DIR: path.join(__dirname, '..'), OWNERS: 'boss' }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', d => { log += d; });
child.stderr.on('data', d => { log += d; process.stderr.write('[server] ' + d); });
function stop() {
  try { child.kill(); } catch (e) {}
  if (process.platform === 'win32') { try { require('child_process').execSync(`taskkill //F //PID ${child.pid}`, { stdio: 'ignore' }); } catch (e) {} }
}
process.on('exit', stop);
setTimeout(() => { console.error('TIMEOUT\n' + log); stop(); process.exit(3); }, 40000).unref();

function client() {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
  const pending = new Map(); let id = 1;
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.ok === false ? p.reject(new Error(m.err)) : p.resolve(m.data); }
  });
  const rpc = (op, args) => new Promise((res, rej) => { const i = id++; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify(Object.assign({}, args, { id: i, op }))); });
  return { ws, rpc, ready: new Promise(r => ws.on('open', r)) };
}
const tryRpc = async (c, op, args) => { try { return { ok: true, data: await c.rpc(op, args) }; } catch (e) { return { ok: false, err: e.message }; } };

(async () => {
  for (let i = 0; i < 100 && !/listening on/.test(log); i++) await sleep(100);
  if (!/listening on/.test(log)) { console.error('server did not start:\n' + log); process.exit(2); }

  const boss = client(), amy = client();
  await Promise.all([boss.ready, amy.ready]);
  await boss.rpc('auth', { user: 'boss', pass: 'pass123', register: true });
  const reg = await amy.rpc('auth', { user: 'amy', pass: 'pass123', register: true });
  ok(reg.data.creditScore === ECON.CREDIT_START, 'new account starts at credit ' + ECON.CREDIT_START);
  await boss.rpc('patch', { path: 'users/amy', value: { money: 20000 } });

  console.log('deposits & withdrawals');
  let d = await amy.rpc('bank', { action: 'deposit', amount: 8000 });
  ok(d.money === 12000 && d.bankBalance === 8000, 'deposit moves cash into the vault');
  ok(!(await tryRpc(amy, 'bank', { action: 'deposit', amount: 999999 })).ok, 'cannot deposit more than you hold');
  d = await amy.rpc('bank', { action: 'withdraw', amount: 3000 });
  ok(d.money === 15000 && d.bankBalance === 5000, 'withdraw moves it back');
  ok(!(await tryRpc(amy, 'bank', { action: 'withdraw', amount: 99999 })).ok, 'cannot overdraw the vault');
  d = await amy.rpc('bank', { action: 'withdraw', amount: 'all' });
  ok(d.bankBalance === 0 && d.money === 20000, 'withdraw all empties the vault');

  console.log('loans');
  const st = await amy.rpc('bank', { action: 'status' });
  ok(st.netWorth === 20000 && st.loanLimit > 0, `status reports net worth ($${st.netWorth}) and ceiling ($${st.loanLimit})`);
  ok(st.loanLimit <= st.netWorth * 1.5, `ceiling ($${st.loanLimit}) is within 1.5x net worth ($${st.netWorth})`);
  const limit = st.loanLimit;
  ok(!(await tryRpc(amy, 'bank', { action: 'loan_take', amount: 50 })).ok, 'loan below the $100 minimum rejected');
  ok(!(await tryRpc(amy, 'bank', { action: 'loan_take', amount: limit + 1 })).ok, 'loan a dollar over the ceiling rejected');
  ok(!(await tryRpc(amy, 'bank', { action: 'loan_take', amount: 500000 })).ok, 'loan far over the ceiling rejected');
  const take = await amy.rpc('bank', { action: 'loan_take', amount: 3000 });
  ok(take.money === 23000 && take.loan && take.loan.owed === ECON.loanTotalDue(3000, ECON.CREDIT_START), 'loan pays out the principal, records the full owed');
  ok(!(await tryRpc(amy, 'bank', { action: 'loan_take', amount: 500 })).ok, 'only one loan at a time');

  console.log('repayment raises credit (a little)');
  let r = await amy.rpc('bank', { action: 'loan_repay', amount: 500 });
  ok(!r.paidOff && r.loan.owed === take.loan.owed - 500, 'partial repayment reduces what is owed');
  r = await amy.rpc('bank', { action: 'loan_repay', amount: 'all' });
  ok(r.paidOff && r.loan == null, 'repay all clears the loan');
  const expectGain = ECON.loanRepayCreditGain(3000, true, true, ECON.CREDIT_START);
  ok(r.creditGain === expectGain && r.creditScore === ECON.CREDIT_START + expectGain,
    `on-time full repay of a big loan raised credit by ${expectGain} (${ECON.CREDIT_START} → ${r.creditScore})`);
  ok(expectGain <= 14, 'the gain is modest even at its best');
  ok(!(await tryRpc(amy, 'bank', { action: 'loan_repay', amount: 100 })).ok, 'nothing to repay once cleared');

  console.log('credit gain is capped at once per 24h');
  const scoreAfter1 = r.creditScore;
  const take2 = await amy.rpc('bank', { action: 'loan_take', amount: 3000 });
  ok(take2.loan && take2.creditScore === scoreAfter1, 'taking another loan same-day does not change the score');
  const r2 = await amy.rpc('bank', { action: 'loan_repay', amount: 'all' });
  ok(r2.paidOff && r2.creditGain === 0 && r2.creditGainBlocked, 'a second on-time payoff within 24h grants NO credit');
  ok(r2.creditScore === scoreAfter1, `score is unchanged (still ${scoreAfter1})`);
  ok(r2.creditGainReadyIn > 23 * 3600000 && r2.creditGainReadyIn <= 24 * 3600000, 'and reports ~24h until the next gain');

  console.log('sell furniture + net worth');
  const { FURNITURE_LIST } = require(path.join(__dirname, '..', 'js', 'furniture.js'));
  const item = ECON.marketStock(FURNITURE_LIST, Date.now()).find(f => f.price >= 100) || FURNITURE_LIST[0];
  const m0 = (await amy.rpc('bank', { action: 'status' })).money;
  await amy.rpc('buy', { kind: 'furniture', item: item.id });
  const afterBuy = await amy.rpc('bank', { action: 'status' });
  ok(afterBuy.money === m0 - item.price, 'buying a piece costs its shelf price');
  ok(afterBuy.netWorth > afterBuy.money + afterBuy.bankBalance, 'owned furniture counts toward net worth');
  const sell = await amy.rpc('buy', { kind: 'sell_furniture', item: item.id });
  ok(sell.gained === ECON.furnitureResaleValue(item.price) && sell.money === afterBuy.money + sell.gained,
    `selling it back pays ${Math.round(ECON.FURNITURE_RESALE * 100)}% ($${sell.gained} of $${item.price})`);
  ok(!(await tryRpc(amy, 'buy', { kind: 'sell_furniture', item: item.id })).ok, 'cannot sell what you no longer own');

  console.log('overdue loan skims earnings');
  // Force a long-overdue loan on amy (latePeriods huge so bankSync adds no new penalty).
  await boss.rpc('patch', { path: 'users/amy', value: { loan: { principal: 1000, owed: 1000, rate: 0.3, takenTs: 1, dueTs: 1, latePeriods: 9e9 } } });
  const owedBefore = (await amy.rpc('bank', { action: 'status' })).loan.owed;
  const e = await amy.rpc('earn', { source: 'typing', amount: 100 });
  ok(e.gained === 100 && e.net === 95, `earning $100 with an overdue loan credits $95 (5% skimmed)`);
  const st2 = await amy.rpc('bank', { action: 'status' });
  ok(st2.loan && st2.loan.owed === owedBefore - 5, `the $5 skim came off the loan (${owedBefore} → ${st2.loan ? st2.loan.owed : 'cleared'})`);
  // Repaying it normally still works and no longer skims.
  await boss.rpc('patch', { path: 'users/amy', value: { money: 5000 } });
  const rr = await amy.rpc('bank', { action: 'loan_repay', amount: 'all' });
  ok(rr.paidOff, 'can still clear an overdue loan by paying it off');
  const e2 = await amy.rpc('earn', { source: 'whack', amount: 100 });
  ok(e2.net === 100, 'once the loan is gone, earnings arrive in full again');

  console.log(`\n${passes} passed, ${fails} failed`);
  stop();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); stop(); process.exit(1); });
