// serialport is a native module: it needs a process of its own, not a worker thread
export default { test: { testTimeout: 60000, pool: 'forks' } };
