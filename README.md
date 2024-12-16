# `performance-event-timing-polyfill`

# Overview

This is a small library which provides a polyfill for the [PerformanceEventTiming API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming) such that is enough for measuring INP across all browsers.

## Why is this useful?

Currently only Chromium based browsers are reporting INP data. This means that interactivity of sites can be improved only for these browsers.
Reality is that other browsers like Safari and Firefox exist and in some cases they form the largest visitor base for a website. Not having data for the user experience there means these sites cannot be optimized for the users of these browsers. Chromium's data cannot be used as a proxy because we know that:
 - events are handled differently sometimes
 - third parties might behave differently for these browsers
 - the site itself might have different behavior for these browsers


Using this library you can get INP data for all browsers and ensure great user experience for everybody :tada:

# Demo

You can test how the polyfill works on this modified version of the popular [INP demo](https://uxify-ltd.github.io/performance-event-timing-polyfill/demos/inp-demo.html) page.

# Usage

## Basic usage

In order to ensure most accurate results load the script as early in your page as possible.
Make sure to load it before you load your code which measures INP.

```HTML
<script src="https://unpkg.com/performance-event-timing-polyfill"></script>
```

## Custom timing calculation
By default the polyfill will try to emulate native [PerformanceEventTiming API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming) entries. However internally the library is tracking the events a bit more granularly. You can subscribe to the raw event measure entries and calculate INP yourself, if you so desire (not recommended).

```JavaScript
import { onInteraction } from 'https://unpkg.com/performance-event-timing-polyfill?module';
onInteraction(console.log);
```

# Browser support

All major browsers are supported. For Chrome, the polyfill doesn't activate by default since this API is provided natively. But the event observer is still active. This means you can still use `onInteraction()` from this library which could be useful if you need apples to apples comparisons across browsers.

# Caveats
 
## Overlapping interactions

When there are overlapping interactions, attribution comes out a bit off currently. Further investigation is needed.

## Must be loaded early

Data may be off if this polyfill is not loaded early enough in the page lifecycle. Ideally it should be loaded before any event listeners are registered and before any performance observers are created. This is needed to ensure that the event handlers added by this library are the first to execute. Otherwise calls to `stopImmediatePropagation()` can prevent the library from detecting an event.

## Not all events are measured

Only `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `pointercancel`, `click`, `auxclick`, `contextmenu`, `keydown`, `keypress`, `keyup` are measured for now.

# Development

## Building the code

To build the code once (production) run

`npm run build`

To build and watch for changes (dev) run

`npm run dev`

## Contributing

Feel free to open issues or PRs to report issues or suggest improvements!