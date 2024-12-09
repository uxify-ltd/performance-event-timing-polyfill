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

let firstInteraction: PerformanceEventTiming | null = null;
const supportedTypes: string[] = ['event', 'first-input'];
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
        (entry) => entry.duration >= (threshold || 16),
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
        options.entryTypes != undefined &&
        (options.durationThreshold != undefined ||
          options.buffered != undefined ||
          options.type != undefined)
      ) {
        // Not allowed so we just ignore the options
        options.entryTypes = undefined;
      }

      if (
        options.entryTypes &&
        (options.entryTypes.indexOf('event') === -1 ||
          options.entryTypes.indexOf('first-input') === -1)
      ) {
        super.observe(options);
        return;
      }

      if (
        !options.type ||
        supportedTypes.indexOf(options.type.toLowerCase()) == -1
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

      if (options.durationThreshold != undefined && !options.entryTypes) {
        this.threshold = Math.max(options.durationThreshold, 16);
      }

      if (options.buffered && !options.entryTypes) {
        if (options.type == 'first-input') {
          if (firstInteraction) {
            this.#callback(
              new PerformanceObserverEntryListPolyfill(
                [firstInteraction],
                this.threshold,
              ),
              this,
            );
          }
          return;
        }

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

        if (PerformanceObserverPolyfill.#types.indexOf('event') == -1) {
          PerformanceObserverPolyfill.#types.push('event');
          PerformanceObserverPolyfill.#types.push('first-input');
        }
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

  const roundToNearestMultipleOfEight = (num: number) => {
    const r = num % 8;
    const adder = 8 - r < 4 ? -(8 - r) : 8 - r;
    num += r > 0 ? 8 - adder : 0;
    return num;
  };

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
          //duration: Math.round(m.inputDelay + m.duration + m.presentationDelay),
          duration: roundToNearestMultipleOfEight(
            Math.round(m.endTime + m.presentationDelay) - m.eventTime,
          ),
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

    for (const [id] of Object.entries(interactions)) {
      //const lasEventEnd =
      //il[il.length - 1].startTime + il[il.length - 1].duration;

      //let lastEventEnd = 0;
      //let lastInteractionId = 0;
      //il.reverse();
      //il.forEach((v, k) => {
      //  if (v.interactionId != lastInteractionId) {
      //    lastInteractionId = v.interactionId;
      //    lastEventEnd = v.startTime + v.duration;
      //  }
      //  // Adjust the durations according to the last event
      //  let dur = lastEventEnd - v.startTime;

      //  interactions[id][k].duration = dur;
      //});
      //il.reverse();

      buffer.push(...interactions[id]);
    }

    const interactionsListFlat = Object.values(interactions).flat();

    for (const [callback, observer] of callbacks) {
      const interactionsList = new PerformanceObserverEntryListPolyfill(
        interactionsListFlat,
        observer.threshold,
      );

      if (!interactionsList.getEntries().length) {
        continue;
      }

      callback(interactionsList, observer);
    }

    if (!firstInteraction && buffer.length) {
      const fi = JSON.parse(buffer[0].toJSON());
      fi.entryType = 'first-input';
      firstInteraction = PerformanceEventTimingPolyfill.fromObject(fi);

      for (const [callback, observer] of callbacks) {
        const interactionsList = new PerformanceObserverEntryListPolyfill(
          [firstInteraction],
          observer.threshold,
        );

        if (!interactionsList.getEntries().length) {
          continue;
        }

        callback(interactionsList, observer);
      }
    }
  });
};
