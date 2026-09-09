# Blackpowder Forts and landing parties

- Island ropes choose the closest point on the generated shoreline and stay secured for the voyage until released with L. Enemy-ship ropes retain their 45-second timer. Island boarding and NPC landing use the nearby shore instead of the island center.
- Looters collect surface treasure without waiting for every defender to die. Damage triggers an eight-second retreat toward a living player or fighter on the same island/floor; otherwise they head back to the ship. They keep carried chests while fleeing, and can still be defeated. They resume work after retreating.
- Press **1** for sword or **2** for flintlock. Aim with the camera, then click or press Space. The flintlock has a server-enforced 1.4-second reload, 420 m range and 65 damage; it does not consume ship cannonballs. Walls, rocks and terrain block gunfire. Attacks while steering are ignored quietly.
- The minimum on-foot/deck camera angle is now 0.18 radians rather than the forced 0.68-radian angle, allowing a substantially lower forward view.
- Random treasure patrols contain two to four soldiers, including musketeers. Each soldier can fight independently; groups can occupy the same area. Musketeers show a one-second aiming warning before firing. Sword and gun hits interrupt their attacks.
- Approximately 28% of generated islands contain a Blackpowder Fort. Forts add 9–12 treasure chests (including a cap on overlapping random surface chests) and 16–25 defenders, mostly musketeers. Physical walls provide cover, with an open gate used by NPC navigation. Four towers, crenellated walls, banners and supply barrels distinguish forts visually. Only the nearest three treasure labels are shown to keep dense courtyards readable.

## Validation

All 14 sea test files passed: 11 server suites including WebSocket integration, plus the three client/motion/render suites. New coverage verifies fort probability, grouped soldiers, gun squads, gate navigation, cover, nearest shoreline anchors, island ropes beyond 45 seconds, quiet captain attacks, weapon hotkeys, gun reloads and damage, looter pickup with living guards, retreat with carried cargo, modeled guns and the lower camera limit.

Browser testing used the production crew service and renderer with disposable in-memory profiles: secured a persistent island rope, landed, equipped the flintlock with 2, observed looters depositing cargo while enemies remained and changing to fleeing after damage, approached the fort, entered its courtyard, and fired the flintlock. Death returned the player to the ship while the rope remained secured. The test encounter was then cleared to inspect fort walls, its gate and treasury. No browser console errors were recorded. Real player saves were not opened by the fixture.

Run `node tools/dark-sea-playtest.cjs`, set sail, then use **Visit expedition shore** for the disposable fort fixture. The walking buttons use normal movement inputs and island navigation. Normal generated islands retain the probabilistic fort chance.
