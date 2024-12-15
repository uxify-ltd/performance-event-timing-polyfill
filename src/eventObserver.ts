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

const interactionLastEvents: string[] = [
  'click',
  'auxclick',
  'keyup',
  'pointercancel',
  'contextmenu',
];

const interactionCallbacks: ((entries: InteractionMeasure[]) => void)[] = [];
const scheduledFrames: Record<number, InteractionMeasure[]> = {};
const chan = new MessageChannel();
const events = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'auxclick',
  'contextmenu',
  'pointercancel',
  'keydown',
  'keypress',
  'keyup',
];
const preferNativeTimes = false; //Using native timestamps leads to weird results (e.g. negative processing times). Need to figure out why
const storedCallbacks: {[key: number]: Function} = {};
const flushedInteractions: Set<number> = new Set();

let isInitialized = false;
let flushTimeout: number = 0;
let measures: InteractionMeasure[] = [];
let activeInteractionId: number = 0;
let callbackIdCounter: number = 0;
let lastResolve: ((e: Event) => void) | null = null;
let currentFrameStart = performance.now();

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

      if (flushedInteractions.has(activeInteractionId)) {
        // Pointercancel can occur before contextmenu for example
        // in which case the interaction measures might be flushed early.
        // For these cases we should ignore events received after the flush (contextmenu after pointercancel)
        return;
      }

      const measure = {
        startTime: procStart,
        duration: 0,
        target: e.target,
        eventType: e.type, // name
        eventTime: e.timeStamp, //startTime
        interactionId: activeInteractionId,
        paintEnd: 0,

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

const getCompleteInteractionMeasures = (): InteractionMeasure[] => {
  if (!measures.length) return [];

  const groupedInteractions: Record<number, InteractionMeasure[]> = {};
  measures.forEach((m) => {
    if (!groupedInteractions[m.interactionId]) {
      groupedInteractions[m.interactionId] = [];
    }
    groupedInteractions[m.interactionId].push(m);
  });

  return Object.values(groupedInteractions)
    .filter(
      (measures: InteractionMeasure[]) =>
        measures[measures.length - 1].paintEnd > 0 &&
        interactionLastEvents.includes(measures[measures.length - 1].eventType),
    )
    .flat();
};

const measurePresentationDelay = (measure: InteractionMeasure) => {
  clearTimeout(flushTimeout);
  const rafExists = scheduledFrames[currentFrameStart];
  if (!rafExists) {
    scheduledFrames[currentFrameStart] = [];
  }
  scheduledFrames[currentFrameStart].push(measure);
  if (rafExists) return;
  const callFrameTime = currentFrameStart;

  requestAnimationFrame(() => {
    const startFrameTime = currentFrameStart;
    onNextTick((referenceTimeStamp: number) => {
      const diff = referenceTimeStamp - startFrameTime;
      scheduledFrames[callFrameTime].forEach((measure) => {
        measure.presentationDelay = diff;
        measure.paintEnd = referenceTimeStamp;
      });
      flushTimeout = setTimeout(flushMeasures, 20) as any;
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
  if (!measures.length) return;

  const completeInteractionMeasures = getCompleteInteractionMeasures();

  if (!completeInteractionMeasures.length) return;

  interactionCallbacks.forEach((cb) => {
    cb(completeInteractionMeasures);
  });

  for (const m of completeInteractionMeasures) {
    flushedInteractions.add(m.interactionId);
    measures.splice(measures.indexOf(m), 1);
  }
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
