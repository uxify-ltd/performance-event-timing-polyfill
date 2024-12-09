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

import {EventEndResult, InteractionMeasure} from './types';

export const interactionEvents = {
  pointer: ['pointerdown', 'pointerup', 'click'],
  keyboard: ['keydown', 'keyup'],
};

const interactionCallbacks: ((entries: InteractionMeasure[]) => void)[] = [];
const scheduledFrames: Record<number, InteractionMeasure> = {};
const chan = new MessageChannel();
const events = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'keydown',
  'keypress',
  'keyup',
];
const preferNativeTimes = false; //Using native timestamps leads to weird results (e.g. negative processing times). Need to figure out why
const storedCallbacks: {[key: number]: Function} = {};

let isInitialized = false;
let flushTimeout: number = 0;
let measures: InteractionMeasure[] = [];
let activeInteractionId: number = 0;
let callbackIdCounter: number = 0;
let lastResolve: ((e: Event) => void) | null = null;
let currentFrameStart = performance.now();
let flushRetries = 0;

export const onInteraction = (cb: (entries: InteractionMeasure[]) => void) => {
  interactionCallbacks.push(cb);
};

const getCallbackId = (cb: Function): number => {
  storedCallbacks[callbackIdCounter] = cb;
  return callbackIdCounter++;
};

const trackEvent = (evName: string) => {
  window.addEventListener(
    evName,
    (e) => {
      const procStart = performance.now();

      switch (evName) {
        case 'pointerdown':
        case 'keydown':
          activeInteractionId++;
          break;
      }

      const measure = {
        startTime: procStart,
        duration: 0,
        target: e.target,
        eventType: e.type, // name
        eventTime: e.timeStamp, //startTime
        interactionId: activeInteractionId,

        endTime: 0,
        inputDelay: procStart - e.timeStamp,
        processingDuration: 0,
        presentationDelay: 0,
      };

      measureEventDuration(e, measure);
      measurePresentationDelay(measure);
    },
    true,
  );
};

const frameLogger = () => {
  currentFrameStart = performance.now();
  requestAnimationFrame(frameLogger);
};

const areInteractionsComplete = () => {
  if (!measures.length) return true;

  const groupedInteractions: Record<number, string[]> = {};
  measures.forEach((m) => {
    if (!groupedInteractions[m.interactionId]) {
      groupedInteractions[m.interactionId] = [];
    }
    groupedInteractions[m.interactionId].push(m.eventType);
  });

  return Object.values(groupedInteractions).every((events) => {
    return (
      events.filter((e) => interactionEvents.pointer.includes(e)).length ==
        interactionEvents.pointer.length ||
      events.filter((e) => interactionEvents.keyboard.includes(e)).length ==
        interactionEvents.keyboard.length
    );
  });
};

const measurePresentationDelay = (measure: InteractionMeasure) => {
  clearTimeout(flushTimeout);
  flushRetries = 0;
  const rafExists = scheduledFrames[currentFrameStart];
  scheduledFrames[currentFrameStart] = measure;
  if (rafExists) return;
  const callFrameTime = currentFrameStart;

  requestAnimationFrame(() => {
    const startFrameTime = currentFrameStart;
    onNextTick((referenceTimeStamp: number) => {
      const diff = referenceTimeStamp - startFrameTime;
      const measure = scheduledFrames[callFrameTime];
      measure.presentationDelay = diff;
      flushTimeout = setTimeout(flushMeasures, 100) as any;
      delete scheduledFrames[callFrameTime];
    });
  });
};

const onNextTick = (cb: Function) => {
  let cbFired = false;
  requestAnimationFrame((animationQueueStart) => {
    if (cbFired) return;
    cb(
      preferNativeTimes ? animationQueueStart : currentFrameStart,
      'animationFrame',
    );
    cbFired = true;
  });
  chan.port2.postMessage(
    getCallbackId((e: MessageEvent) => {
      if (cbFired) return;
      cb(preferNativeTimes ? e.timeStamp : performance.now(), 'channelMessage');
      cbFired = true;
    }),
  );
  lastResolve = (e: Event) => {
    if (cbFired) return;
    cb(preferNativeTimes ? e.timeStamp : performance.now(), 'eventFired');
    cbFired = true;
  };
};

const measureEventDuration = (e: Event, measure: InteractionMeasure) => {
  lastResolve && lastResolve(e);
  const evName = e.type;
  new Promise<EventEndResult>((res) => {
    onNextTick((referenceTimeStamp: number) => {
      res({
        evName,
        timeStamp: referenceTimeStamp,
      });
    });
  }).then(({timeStamp}) => {
    const dur = timeStamp - measure.startTime;
    measure.duration = dur;
    measure.endTime = timeStamp;
    measure.processingDuration = dur;
    measures.push(measure);
  });
};

const flushMeasures = () => {
  if (!areInteractionsComplete() && flushRetries < 5) {
    flushRetries++;
    clearTimeout(flushTimeout);
    flushTimeout = setTimeout(flushMeasures, 100) as any;
    return;
  }

  interactionCallbacks.forEach((cb) => {
    cb(measures);
  });

  measures = [];
  flushRetries = 0;
};

export const initObserver = () => {
  if (isInitialized) return;
  isInitialized = true;

  chan.port1.onmessage = (e) => {
    storedCallbacks[e.data](e);
    delete storedCallbacks[e.data];
  };

  for (const ev of events) {
    trackEvent(ev);
  }

  // Mobile Safari won't dispatch click unless there is at least one click listener on the document or its children
  document.addEventListener('click', () => {}, true);

  requestAnimationFrame(frameLogger);
};
