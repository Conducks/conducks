// Conducks — cap analyze parallelism during tests.
//
// `worker-pool.ts` sizes itself at `os.cpus().length - 1` — 11 workers on a 12-core machine — and the
// suite spawns `analyze` many times: integration tests, the CLI smoke run, the benchmark subjects.
// Twelve cores saturated for minutes at a time is what makes the laptop hot, and it buys almost
// nothing here.
//
// Measured on subject-c (10.5k nodes, 34.9k edges): 11 workers analyzes in 20s, 4 workers in 23s. A 15%
// wall-clock cost for roughly a third of the parallel load. In a test run, where correctness is the
// point and wall-clock already loses to jest's own serialisation, that is the right side of the trade.
//
// An explicit CONDUCKS_WORKERS always wins, so a benchmark run can still ask for full width.
process.env.CONDUCKS_WORKERS ??= '4';
