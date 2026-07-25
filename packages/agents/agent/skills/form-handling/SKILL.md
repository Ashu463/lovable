---
name: form-handling
description: Validation, submission, and error-display conventions for any form. Use whenever writing or editing a form — input collection, validation rules, submit handling, or the success/error states around a submission.
---

# Form Handling

## Validation

- Validate on the client for immediate feedback, but never trust it as the
  only check — the same validation must also happen wherever the data is
  actually persisted (see `database-integration` / `api-route-conventions`
  for the server side of this).
- Show validation errors inline, next to the field they belong to — not
  only as a single summary banner at the top of the form.
- Validate on blur/submit, not on every keystroke, unless the project's
  existing forms already establish live-validation as the pattern.

## Submission

- Disable the submit control (or show a pending state) while a submission
  is in flight — never allow a double-submit from a fast double-click.
- On success: clear the form (for create flows) or reflect the saved state
  (for edit flows), and show explicit confirmation — don't leave the user
  guessing whether it worked.
- On failure: surface the actual error (field-level if the failure is
  field-specific, form-level otherwise) — never fail silently or leave the
  form looking like it's still submitting.

## Rules

- Use the project's existing form library/pattern if one is already in use
  — don't introduce a second one for a new form.
- Required fields are marked in the UI, not just enforced silently on
  submit.
- Preserve user input on a failed submission — never clear the form on
  error.

## Do not

- Submit a form without a pending/disabled state on the control.
- Rely on client-side validation alone for anything that touches the
  database.
- Show a generic "something went wrong" when the failure response actually
  has field-level detail available to show instead.
