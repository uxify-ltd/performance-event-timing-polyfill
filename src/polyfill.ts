/*
 Copyright 2024 Uxify Ltd
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

import {initObserver, onInteraction, interactionEvents} from './eventObserver';
import {
  InteractionMeasure,
  PerformanceEventTimingInitPolyfill,
  PerformanceObserverInitPolyfill,
} from './types';

const hasNativeEventTimingSupport =
  'PerformanceEventTiming' in self &&
  'interactionId' in PerformanceEventTiming.prototype;

export const initPolyfill = () => {
  initObserver();

  if (!('PerformanceObserver' in self)) {
    return;
  }

  if (
    // @ts-ignore
    !window.forceEventTimingPolyfill &&
    hasNativeEventTimingSupport
  ) {
    return;
  }

  class PerformanceEventTimingPolyfill {
    startTime!: number;
    duration!: number;
    entryType!: string;
    name!: string;
    cancelable!: boolean;
    interactionId!: number;
    processingEnd!: number;
    processingStart!: number;
    target!: Node | null;
    toJSON!: () => string;

    //constructor(init: PerformanceEventTimingInitPolyfill) {
    //  Object.assign(this, init);
    //}

    static fromObject(
      init: PerformanceEventTimingInitPolyfill,
    ): PerformanceEventTimingPolyfill {
      const entry = new PerformanceEventTimingPolyfill();
      Object.assign(entry, init);
      return entry;
    }
  }

  PerformanceEventTimingPolyfill.prototype.startTime = 0;
  PerformanceEventTimingPolyfill.prototype.duration = 0;
  PerformanceEventTimingPolyfill.prototype.entryType = 'event';
  PerformanceEventTimingPolyfill.prototype.name = 'event';
  PerformanceEventTimingPolyfill.prototype.cancelable = true;
  PerformanceEventTimingPolyfill.prototype.interactionId = 0;
  PerformanceEventTimingPolyfill.prototype.processingEnd = 0;
  PerformanceEventTimingPolyfill.prototype.processingStart = 0;
  PerformanceEventTimingPolyfill.prototype.target = null;
  PerformanceEventTimingPolyfill.prototype.toJSON = function () {
    const result: Record<string, any> = {};
    for (const key of Object.keys(this)) {
      result[key] = (this as any)[key];
    }
    return JSON.stringify(result);
  };

  (self as typeof globalThis).PerformanceEventTiming =
    PerformanceEventTimingPolyfill as typeof PerformanceEventTiming;

  class PerformanceObserverEntryListPolyfill {
    #entries: PerformanceEventTiming[];

    constructor(entries: PerformanceEventTiming[], threshold?: number) {
      this.#entries = entries.filter(
        (entry) => entry.duration >= (threshold || 0),
      );
    }

    getEntries() {
      return this.#entries;
    }

    getEntriesByName(name: string, type?: string): PerformanceEntryList {
      return this.#entries.filter(
        (entry) => entry.name === name && (!type || entry.entryType === type),
      );
    }

    getEntriesByType(type: string): PerformanceEntryList {
      return this.#entries.filter((entry) => entry.entryType === type);
    }
  }

  // @ts-ignore
  class PerformanceObserverPolyfill extends PerformanceObserver {
    static #nativePO = PerformanceObserver;
    static #types: string[] | undefined = undefined;
    #callback: PerformanceObserverCallback;
    threshold: number = 104;

    constructor(callback: PerformanceObserverCallback) {
      super(callback);
      this.#callback = callback;
    }

    observe(options: PerformanceObserverInitPolyfill) {
      if (
        options.type?.toLowerCase() !== 'event' &&
        (!options.entryTypes || options.entryTypes.indexOf('event') === -1)
      ) {
        super.observe(options);
        return;
      }

      if (
        // @ts-ignore
        !window.forceEventTimingPolyfill &&
        hasNativeEventTimingSupport
      ) {
        super.observe(options);
        return;
      }
      callbacks.push([this.#callback, this]);

      if (options.durationThreshold && !options.entryTypes) {
        this.threshold = Math.max(options.durationThreshold, 16);
      }

      if (options.buffered) {
        this.#callback(
          new PerformanceObserverEntryListPolyfill(buffer, this.threshold),
          this,
        );
      }
    }

    disconnect() {
      super.disconnect();
      const index = callbacks.indexOf([this.#callback, this]);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }

    static get supportedEntryTypes() {
      if (PerformanceObserverPolyfill.#types == undefined) {
        PerformanceObserverPolyfill.#types = Array.from(
          PerformanceObserverPolyfill.#nativePO.supportedEntryTypes,
        );
        PerformanceObserverPolyfill.#types.push('event');
      }

      return PerformanceObserverPolyfill.#types;
    }
  }

  // @ts-ignore
  (self as typeof globalThis).PerformanceObserver = PerformanceObserverPolyfill;

  const buffer: PerformanceEventTiming[] = [];
  const callbacks: [
    PerformanceObserverCallback,
    PerformanceObserverPolyfill,
  ][] = [];

  onInteraction((entries: InteractionMeasure[]) => {
    const interactions: Record<string, PerformanceEventTimingPolyfill[]> = {};
    const interactionEventsFlat = Object.values(interactionEvents).flat();

    entries.forEach((m) => {
      if (!interactions[m.interactionId]) {
        interactions[m.interactionId] = [];
      }

      interactions[m.interactionId].push(
        PerformanceEventTimingPolyfill.fromObject({
          startTime: m.eventTime,
          duration: Math.round(m.inputDelay + m.duration + m.presentationDelay),
          interactionId:
            interactionEventsFlat.indexOf(m.eventType) > -1
              ? m.interactionId
              : 0,
          processingStart: m.startTime,
          processingEnd: m.startTime + m.processingDuration,
          entryType: 'event',
          name: m.eventType,
          target: m.target as Node,
        }),
      );
    });

    for (const [id, il] of Object.entries(interactions)) {
      const lasEventEnd =
        il[il.length - 1].startTime + il[il.length - 1].duration;
      il.forEach((v, k) => {
        // Adjust the durations according to the last event
        interactions[id][k].duration = lasEventEnd - v.startTime;
      });

      buffer.push(...interactions[id]);
    }

    const interactionsListFlat = Object.values(interactions).flat();
    for (const [callback, observer] of callbacks) {
      callback(
        new PerformanceObserverEntryListPolyfill(
          interactionsListFlat,
          observer.threshold,
        ),
        observer,
      );
    }
  });
};
