# Evidence rules

## Screenshot directory

`/tmp/notebooklm-cleanup/screenshots/`

If the directory doesn't exist, create it before starting.

## Naming convention

`NN-action-target.png`

Examples:
- `00-initial-state.png`
- `01-quarantine-created.png`
- `02-delete-master-compilation-before.png`
- `02-delete-master-compilation-after.png`
- `03-quarantine-add-clickbait-1.png`
- `04-reimport-IUzAH3RQ7oY.png`
- `99-main-final.png`
- `99-quarantine-final.png`

## When to screenshot

Required:
- Initial state (before any action)
- After creating QUARANTINE notebook
- Before AND after the first 3 deletions
- Every 5th deletion thereafter (5th, 10th, 15th, 20th, 25th)
- After each quarantine move
- After each P0 video re-import (showing the new title with `[video_id]` prefix)
- Final state of both notebooks

## What screenshots prove

Each screenshot must show:
- Visible source count (or visible portion of source list)
- For renames: the new title with `[video_id]` prefix clearly visible
- For deletions: the source list before with the source visible, and after with it gone (or the dialog confirming deletion)

## Evidence log

Maintain `/tmp/notebooklm-cleanup/evidence-log.csv`:

```
timestamp,action,target,screenshot_filename,result
2026-04-30T12:34:56Z,delete,USCIS Helper Master Document Compilation #2,02-delete-master-compilation-before.png,success
```

Without screenshot proof, an action is considered NOT done. The final report MUST list every screenshot taken.
