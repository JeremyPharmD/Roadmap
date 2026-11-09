# Pocket

A strategy and initiative planner for one person, kept in this browser. The home screen keeps one numbered priority order: drag a card to change its ranking. Start weekly review, or open any project, to walk through projects in that order. Choose a week to see its dated updates and decisions. Each project has a next step, owner, and full due date; these are captured with each new update. Reviewed & next saves a pending update, marks that project reviewed for the selected week, and advances in priority order. Review checks are separate from task completion. Other dated entries stay in history. Work items, size, summary, and undated notes are expandable. Existing notes keep their text without invented dates. Existing Review flags remain available as Flag for attention. Fields save as you type; dated entries save with Save dated update or when navigating away. Cancel discards the entry draft.

Projects, recommendations, and deliverables are separate records. A recommendation keeps the wording from the user-provided Scale Readiness & Operating System Diagnostic (Matt Cook, Scale That Works; fieldwork September 14 and October 19, 2026). The response and action plan are written separately. Those recommendations are planning inputs, not approved commitments. The diagnostic's proposed description of Epiq Plans is recorded as a proposal. Purpose, scope, minimum viable offering, and launch criteria stay an open question until someone fills them in.

Planning horizons are NOW (0–90 days), NEXT (3–6 months), and Later (6+ months in the diagnostic). They are not the calendar quarters, and a horizon is not a commitment. Horizon dates are not calculated until a planning baseline date is set. NOW and NEXT overlap around month three; the labels are kept as supplied.

A deliverable can be Candidate, Committed, or Deferred. Choosing Committed while the definition, dependencies, or readiness fields are empty asks for confirmation. That confirmation is not an approval. Checklist completion is labeled Checklist complete and stays separate from the project stage.

The list has one priority order. Every active project is in that list, and the arrows and drag handle are always available.

Recommendations, deliverables, checklists, and the manual planning tables stay in the saved plan. The home screen does not show them. Numbers that are not entered stay blank. Unknown is not zero. Unlike units are not added together. A negative queue balance is spare capacity, and the projected remaining queue is zero. Thresholds are whatever you enter. A launch item marked Ready does not approve the launch. Playbooks with no exercise date are not described as tested.

Live system integrations and AI interpretation of notes are future work. This version does not log in, assign work, send notifications, upload files, or invent a status when data is missing.

A new project is added at the top of the list. Removing a project, checklist line, journal entry, reference, deliverable, cost row, or schedule block can be undone until the next change. If the saved plan cannot be read, it is left in place and the page offers a backup download.

`npm start` serves the page. It listens on `PORT`, or 8080. `npm test` runs the focused checks.

## License matrix

`licenses.html` is the credential page. It keeps the state-by-state pharmacy breakdown, pharmacist licenses, pharmacy technicians, and accreditations on one matrix. Status, license number, controlled-substance text, telemedicine and reciprocity flags, and renewal dates sit on the row. Accreditations are added by hand. The page does not seed them.

Status uses the sooner of the pharmacy expiration and the controlled-substance expiration. Expired rows, rows inside the reminder lead, suspended rows, and a renewal filed without an expiration date show in the alert list. A filed renewal stays in that list until the driving date is outside the reminder lead. A lapsed date stays expired even if the posture says pending or renewal filed. Inactive rows do not raise an expiration alert. Rows that still need a date are counted, and they are not listed as alerts.

The first visit loads one blank pharmacy-license row for each state and Washington DC. Those rows are an empty list, not credentials on file. Import W2 workbook reads the Out of State License Breakdown, Pharmacists, and Pharmacy Techs sheets in the browser and replaces the matrix. Portal username and password columns are dropped before any value is copied. A second click confirms the replacement once the matrix has been edited. Duplicate a state or pharmacist row for another state; the copy clears the license number and the dates. Add missing states puts back a blank row for a removed state without resetting an edited one.

Reminder defaults are 90 days for state licenses, 60 days for pharmacist licenses, 60 days for technicians, and 180 days for accreditations. A row can set its own lead, from 0 through 1,095 days. Leave the row lead blank to keep the default. The page does not email, text, or file a renewal with a board.

The matrix is saved in this browser under `license-matrix`. Export JSON is the backup and includes the reminder defaults and the operational fields. Export CSV is a snapshot of the status on the day it was exported. Import JSON replaces the matrix in this browser. A roadmap backup is rejected. If the saved matrix cannot be read, it is left in place until it is downloaded or replaced.
