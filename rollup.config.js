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

import terser from '@rollup/plugin-terser';

const configurePlugins = ({module}) => {
  return [
    terser({
      module,
      mangle: true,
      compress: true,
    }),
  ];
};

const configs = [
  {
    input: 'dist/modules/index.js',
    output: {
      format: 'esm',
      file: './dist/performance-event-timing-polyfill.js',
    },
    plugins: configurePlugins({module: true}),
  },
  {
    input: 'dist/modules/index.js',
    output: {
      format: 'iife',
      file: './dist/performance-event-timing-polyfill.iife.js',
      name: 'performanceEventTimingPolyfill',
    },
    plugins: configurePlugins({module: false}),
  },
];

export default configs;
