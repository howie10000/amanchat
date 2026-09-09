# Crew and staff finance update

Sailing specialists can be rescued repeatedly from different camps. Copies fill separate cannons, alternating port and starboard until the ship is fully staffed. Players at a cannon take priority. Specialist perks retain the existing one/two slots and do not stack from duplicate copies. Dismissal confirms first and removes just the selected copy; remaining copies preserve its equipped perk.

Leviathan health and attack damage increased 10%, with existing attack warning and dodge windows retained. Forts have 9/10/11/12 treasure chests by tier; overlapping random surface chests are removed from the fort footprint. Fort defenders remain numerous.

## Staff instructions

Restart the game server to load the new operation and refresh the game page. Sign in as an owner or admin. Open the Staff app/button, then **BANKS & GUILD TREASURIES**. Choose **Player bank** or **Guild treasury**, select the account, and read its recorded balance. Enter the desired total, press **Set balance**, and confirm. **Refresh balances** reloads current records. Offline accounts are included.

Set replaces the total rather than adding to it. A bank edit restarts interest from the edit time. Wallet balances, loans, and guild members' individual deposits remain separate. Amounts must be whole dollars from 0 through 1,000,000,000,000. Each edit logs the staff account, target, before/after balances, and timestamp on the server. Staff permissions are checked on every request.

## Validation

All sea test files pass, including duplicate rescue, distinct cannon stations, individual dismissal, fort caps, combat, progression, controls and rendering. The isolated staff finance integration test passes owner/admin access, regular-player denial, offline edits, zero balances, invalid-input rejection, guild-deposit preservation, raw-write protection and role revocation. Existing bank tests pass. The broader guild test completed with 108 passing checks and one failure in its unrelated boss-combat assertion, `a valid hit lands`; guild finance checks passed.
