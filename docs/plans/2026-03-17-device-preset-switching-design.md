# Device Preset Switching Design

## Scope

- Replace the built-in preset area in device management with a category switcher.
- Reduce preset and custom device card noise so the summary fits the selection task.

## Decisions

- Use `a-segmented` for `iOS / Android / Windows` and render only the active group.
- Default to the first group that has data before the user makes a manual selection.
- Preset cards show `name`, `system`, `model`, and the create action.
- Custom profile cards show `name`, `OS`, optional `source` tag, `system`, `model`, and `updated at`.
- Remove `deviceId` from both card summaries and keep that detail in the edit modal.

## Validation

- Run `pnpm --filter web build`.
