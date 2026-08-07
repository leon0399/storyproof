---
"storyproof": patch
---

Report a refused navigation as the capture failure on every engine. A story that
navigates somewhere unreachable now fails immediately, naming the origin and the
refusal, instead of waiting out the readiness budget and reporting a generic
"Timed out waiting for Storybook readiness" — which is what WebKit did, because
it keeps the current document when a navigation is refused where Chromium and
Firefox replace it.
