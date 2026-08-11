# Telegram polling reliability primitives

`acquireTelegramSingleton(backupDirectory)` is separate from the general runtime admission lease.
The runner must hold both leases before it opens the Telegram database or starts long polling. A
second poller fails immediately with `TelegramSingletonBusyError`; it must not retry admission in a
tight loop.

The singleton lease is an ownership-checked file in the backup directory. A dead poller lease is
removed only while holding the short admission gate because it does not represent an in-progress
data transition. A malformed lease, or a dead/malformed admission gate, fails closed and requires
manual inspection. Releasing a lease whose contents changed never removes the replacement.

`TelegramPoller` reports sanitized lifecycle status and successful-poll heartbeats through hooks.
Transient failures use capped exponential backoff with downward jitter. The runner must supply a
classifier that treats authentication, webhook/long-poll conflicts, and invalid configuration as
fatal; status hooks intentionally receive no raw error.

`TELEGRAM_PROCESSING_DEADLINE_MS` defines the intended maximum update-processing time. The runner
still needs to enforce that deadline through cancellation. Configuration rejects an HTTP timeout
that cannot cover long polling plus five seconds, and rejects an update lease that cannot cover the
processing deadline plus five seconds.
