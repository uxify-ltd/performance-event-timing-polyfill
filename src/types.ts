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

export type EventEndResult = {
  evName: string;
  timeStamp: number;
};

export type InteractionMeasure = {
  startTime: number;
  endTime: number;
  duration: number;
  target: EventTarget | null;
  inputDelay: number;
  processingDuration: number;
  presentationDelay: number;
  eventType: string;
  eventTime: number;
  interactionId: number;
  paintEnd: number;
};

export type PerformanceEventTimingInitPolyfill = {
  startTime: number;
  duration: number;
  entryType: string;
  name: string;
  interactionId: number;
  processingEnd: number;
  processingStart: number;
  target: Node | null;
};

export interface PerformanceObserverInitPolyfill
  extends PerformanceObserverInit {
  durationThreshold?: number;
}
