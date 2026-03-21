import { runBatch } from './simulation-engine.js';

self.onmessage = (e) => {
  const params = e.data;
  const games = runBatch({
    ...params,
    onProgress: (completed, total) => {
      self.postMessage({ type: 'progress', completed, total });
    },
  });
  self.postMessage({ type: 'done', games });
};
