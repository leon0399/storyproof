---
"storyproof": patch
---

Add a 60-second Node-side timeout to each story capture. A capture that hangs — due to a browser transport failure, a Node runtime regression, or an unresponsive engine — now reports "Capture timed out" instead of freezing the UI indefinitely.
