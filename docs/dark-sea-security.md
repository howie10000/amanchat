# Dark Sea server security review

Reviewed the public WebSocket sea RPC, protected progression writes, shared-crew routing, movement, stations, combat, ammunition, recruitment, cargo, banking, and bounded world snapshots.

Changes:

- Reject malformed request objects, invalid numeric inputs, invalid cannon sides, and oversized island acknowledgement lists before crew simulation or snapshot creation.
- Only own catalog properties count as valid ships/ammunition. Inherited JavaScript names cannot be purchased or selected.
- Owners who leave a ship while guests remain cannot fall through to solo-voyage commands. They must rejoin using Sail; joining another crew while owning an active room is rejected.
- Refuse mutations and banking on a hull with zero health, including the interval before the next simulation tick.
- Cancel pending swings and repairs across floor, ship, and cave transitions; PvP melee respects island and cave identity.
- Limit production sea requests by authenticated account to a 50-request burst, refilling at 25 requests per second. Normal 10 Hz inputs fit this budget. The bounded limiter expires idle entries and does not reset on reconnect.

Validation: all 20 sea test files pass. `sea-security.test.js` covers forged state, malformed packets, catalog keys, station/owner authority, departed-owner command bypasses, sunk-ship payout replay, and request budgets. `sea.integration.test.js` runs a disposable local server and tests real WebSocket authentication, protected save writes, forged account fields, invalid purchases, and flooding. Existing suites cover ammo consumption, cooldowns, hit simulation, loot stow/banking, and crew movement. No production player saves were used.

Limits: this is a source review and regression suite, not a guarantee that no exploit remains. Players control browser rendering and can automate legal inputs or inspect entity data sent for rendering (including cave contents). These changes do not claim to prevent visual modifications, aim assistance, bots, distributed denial of service, or compromised staff accounts. World interest management remains the existing bounded sector system.

Restart the Node game server to activate these server-side changes.
