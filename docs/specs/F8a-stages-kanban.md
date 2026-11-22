# F8a · Custom stages and kanban
Owner: B (John) · full stack (web + api + db + tests) · Days 14–14 · Release 2 · Tracker: F8.1, F8.2 · PRD: [F8](../PRD.md#f8)

## Goal
Each client has its own pipeline stages and the team moves leads across a kanban board.

## Acceptance criteria
- [ ] Custom stages per client (add, rename, reorder, delete; deleting moves leads to a chosen stage).
- [ ] Kanban with drag and drop; a stage change writes timeline + audit; stage is independent of the client mark.

## Data model / API / job changes
- pipeline_stages CRUD (`pipeline.manage`); leads.stage_id update (`lead.update`) → lead_events, audit, `emitChange('lead')`.
- dnd-kit board; keyboard-accessible moves.

## Files touched
- B (John): src/modules/pipeline/*, src/app/[locale]/(app)/p/[projectId]/pipeline/*, settings/stages/*, messages/en/pipeline.json

## Dependencies
F2b, F4b.

## Edge cases
- Deleting the last stage is blocked; deleting a stage with leads requires a target stage.
- Two users move the same lead → last write wins, both moves in the timeline.
- RTL: board order mirrors.
- Moving a card never changes the lead status.

## Out of scope
Automatic stage moves from client marks (only via an automation rule, F12), Won/Junk statuses.

## Test plan
- Stage CRUD with reassignment; permission (a client user cannot edit stages and never sees the board or stage labels).
- Drag/drop and keyboard move write one timeline + audit row each.
