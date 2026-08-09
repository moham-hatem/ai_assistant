# Chat answer feedback UI

The learner can rate each successfully returned assistant answer once. The controls are intentionally absent from the welcome message, user messages, the in-progress placeholder, and request errors.

## Message and request boundary

- A successful assistant message has a local UI `id` and a separate `requestId` from `/api/answer-question`.
- The UI uses that `requestId` only as `questionLogId` when it posts feedback.
- The feedback request contains only `questionLogId`, `rating`, `reasons`, optional `comment`, and a random `submissionId`.
- The answer, question, history, language, learner identity, and device or browser fingerprint are never included.
- The answer API must return a `requestId` whose question log is available by the time immediate feedback can reach `/api/feedback`.

## Learner flow

`Helpful` opens a short inline confirmation and sends `reasons: []`. `Not helpful` opens an accessible dialog where at least one allow-listed reason is required and the optional comment is limited to 1,000 characters.

Each message owns an independent state machine: idle, confirmation/editing, submitting, error, and success. A random `submissionId` is created once when an attempt opens. A retry reuses an immutable snapshot with the same ID, while canceling and opening a new attempt creates a new ID. Duplicate submissions and stale async completions are ignored. Success is terminal for that message.

The success state maps `reviewId !== null` to a learner-facing `reviewRouted` boolean. This correctly handles both a newly created review and feedback linked to an existing review, while never rendering or retaining the returned identifier in learner-facing state.

## Errors and accessibility

Network, rejected-request, and malformed-response failures map to localized safe messages. Raw server messages and stacks are not displayed.

The controls use native buttons, checkboxes, labels, status/alert regions, visible focus indicators, and 44-pixel touch targets. The report dialog traps focus, closes with its close button, Cancel, backdrop, or Escape when no submission is active, and restores focus to its trigger. Message and comment content use `dir="auto"`; the surrounding UI follows the selected Arabic RTL or English/Swahili LTR direction.

## Translation keys

All learner-facing copy lives under `AppTranslations.feedback` for `ar`, `en`, and `sw`, including the six reason labels, retry errors, review outcome, and dialog actions.

## Frontend verification

The local suite covers the response parser and typed client, exact privacy-limited payloads, validation boundaries, independent reducers, duplicate clicks, stable retry snapshots, stale completions, terminal success, random attempt IDs, and preservation of `requestId` only on successful answer messages. Visual QA covers desktop and mobile layouts in all three languages plus dialog focus and Escape behavior.
