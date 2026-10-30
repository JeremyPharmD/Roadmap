# Pocket

A phone-width work tracker. The list is ranked by hand. Drag a card, or use the arrows, to change that order.

Each card has an owner, a next action, and a target date. The phase is separate from the checklist: Evaluate, Investigate feasibility, Ready for review, Completed, or Blocked. Completed cards leave Next 3. Blocked cards stay in rank order and are marked Blocked. Next 3 shows the next action for the first three cards that are not completed.

Project cards start with the same review: cost savings, timing, effort, target delivery, and a regulatory check. Those five can hold a short answer. Target delivery is a date. The bar is the share of checklist lines that are checked. It is labeled Checklist complete, and it is not the same as finishing the initiative.

Export writes a backup file. Import checks the file, then asks before it replaces the list on this browser. Removing a card or a requirement can be undone until the next change. The list is saved in this browser only. If that save cannot be read, it is left in place and the page offers a backup download.

`npm start` serves the page for hosting. It listens on `PORT`, or 8080. `npm test` runs the focused checks.

Modules are numbered by their current position. Tap a card to open it; hold it briefly to lift and drag vertically, or use its grip or up/down buttons. The page scrolls when a lifted card approaches the screen edge. Escape cancels a drag. Text wraps in full on small screens.

The first five modules are Hard Candy implementation, Independence from Best Rx, IT cost and spend, Labor model; packaging, and Labor model: compounding. Existing modules and their text remain below these; the existing Capital IT spend module is renamed in place. This ordering is applied once when updating an older save, then manual ordering is preserved.

Labor model: compounding is a data collection module, with editable fields for observation period, product, output, staffing, time, delays, and notes. It has no project phase or completion checklist. Its data is included in backups.
