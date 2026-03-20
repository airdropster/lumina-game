import { runSimulation } from './simulation-engine.js';

self.onmessage = (e) => {
  const params = e.data;
  const results = runSimulation({
    ...params,
    onProgress: (completed, total) => {
      self.postMessage({ type: 'progress', completed, total });
    },
  });
  self.postMessage({ type: 'results', results });
};
