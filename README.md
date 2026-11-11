# Pocket

A strategy and initiative planner for one person, kept in this browser. The home screen is a numbered project roadmap. Drag a card to change its priority. A card shows its name. The size is a short letter under the name, and the due date is on the far right. Type the month and the day, like 11 and 04. Open a card to choose the size. The plus beside Updates opens a large box that starts with a bullet, and a date. Enter adds another bullet in that same note. Save keeps the whole note under the date. Cancel closes the box without saving. The plus beside Next item works the same way. A summary sits under the name in smaller type. Save stores the card and closes it. A Review checkbox inside an open card marks that whole card. The card stays highlighted in its color until Review is unchecked.

Projects, recommendations, and deliverables are separate records. A recommendation keeps the wording from the user-provided Scale Readiness & Operating System Diagnostic (Matt Cook, Scale That Works; fieldwork September 14 and October 19, 2026). The response and action plan are written separately. Those recommendations are planning inputs, not approved commitments. The diagnostic's proposed description of Epiq Plans is recorded as a proposal. Purpose, scope, minimum viable offering, and launch criteria stay an open question until someone fills them in.

Planning horizons are NOW (0–90 days), NEXT (3–6 months), and Later (6+ months in the diagnostic). They are not the calendar quarters, and a horizon is not a commitment. Horizon dates are not calculated until a planning baseline date is set. NOW and NEXT overlap around month three; the labels are kept as supplied.

A deliverable can be Candidate, Committed, or Deferred. Choosing Committed while the definition, dependencies, or readiness fields are empty asks for confirmation. That confirmation is not an approval. Checklist completion is labeled Checklist complete and stays separate from the project stage.

The list has one priority order. Every active project is in that list, and the arrows and drag handle are always available.

Recommendations, deliverables, checklists, and the manual planning tables stay in the saved plan. The home screen does not show them. Numbers that are not entered stay blank. Unknown is not zero. Unlike units are not added together. A negative queue balance is spare capacity, and the projected remaining queue is zero. Thresholds are whatever you enter. A launch item marked Ready does not approve the launch. Playbooks with no exercise date are not described as tested.

Live system integrations and AI interpretation of notes are future work. This version does not log in, assign work, send notifications, upload files, or invent a status when data is missing.

A new project is added at the top of the list. Removing a project, checklist line, journal entry, reference, deliverable, cost row, or schedule block can be undone until the next change. If the saved plan cannot be read, it is left in place and the page offers a backup download.

`npm start` serves the page. It listens on `PORT`, or 8080. `npm test` runs the focused checks.
