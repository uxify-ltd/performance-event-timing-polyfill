# Changelog

### v0.5.1 (2024-12-16)

 - Avoid JSON encode -> decode when cloning the first input entry. Resolves issues with cyclic references.

### v0.5.0 (2024-12-16)

 - Improve accuracy by handling the following additional events: `auxclick`, `contextmenu`, `pointercancel`
 - Report event timings sooner after the interaction ends (compared to what it used to be)

### v0.4.0 (2024-12-10)

 - Provide support for first-input events
 - Event entry duration rounded to the nearest 8ms
 - More accurate duration calc when multiple events are bundled in the same frame
 - Bug fix: Treat durationThreshold: 0 as 16ms instead of ignoring it
 - Bug fix: When eventTypes is used in .observe passthrough for anything other than the types handled by the polyfill

### v0.3.0 (2024-12-06)

 - Initial public release
