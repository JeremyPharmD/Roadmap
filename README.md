# Pocket

A strategy and initiative planner for one person, kept in this browser. The home screen is a ranked project list. Open a project for its brief, checklist, journal, and any planning table that belongs to that work.

Projects, recommendations, and deliverables are separate records. A recommendation keeps the wording from the user-provided Scale Readiness & Operating System Diagnostic (Matt Cook, Scale That Works; fieldwork September 14 and October 19, 2026). The response and action plan are written separately. Those recommendations are planning inputs, not approved commitments. The diagnostic's proposed description of Epiq Plans is recorded as a proposal. Purpose, scope, minimum viable offering, and launch criteria stay an open question until someone fills them in.

Planning horizons are NOW (0–90 days), NEXT (3–6 months), and Later (6+ months in the diagnostic). They are not the calendar quarters, and a horizon is not a commitment. Horizon dates are not calculated until a planning baseline date is set. NOW and NEXT overlap around month three; the labels are kept as supplied.

A deliverable can be Candidate, Committed, or Deferred. Choosing Committed while the definition, dependencies, or readiness fields are empty asks for confirmation. That confirmation is not an approval. Checklist completion is labeled Checklist complete and stays separate from the project stage.

The list has one global priority order. Categories group that same list. Dragging and the arrows are available from Change priority order, when every active project is visible. A filtered or grouped view does not create a second ranking.

Specialized tables stay inside the project they belong to: the IT budget, the Monday–Saturday weekly template, the pause-and-harden scorecard, the manual operating-control table, the workflow register, launch records, system bridges, continuity playbooks, commercial rules and cost components, decision rights, and capacity and coverage notes. Numbers that are not entered stay blank. Unknown is not zero. Unlike units are not added together. A negative queue balance is spare capacity, and the projected remaining queue is zero. Thresholds are whatever you enter. A launch item marked Ready does not approve the launch. Playbooks with no exercise date are not described as tested.

Live system integrations and AI interpretation of notes are future work. This version does not log in, assign work, send notifications, upload files, or invent a status when data is missing.

Export writes a backup. Import checks the file, then asks before it replaces the plan on this browser. Removing a project, checklist line, journal entry, reference, deliverable, cost row, or schedule block can be undone until the next change. If the saved plan cannot be read, it is left in place and the page offers a backup download.

`npm start` serves the page. It listens on `PORT`, or 8080. `npm test` runs the focused checks.
