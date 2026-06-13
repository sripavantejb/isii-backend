/**
 * DB latency benchmark.
 *
 * Measures raw round-trip latency from THIS machine to a MongoDB cluster by
 * issuing repeated `ping` admin commands (the lightest possible round trip),
 * so the number reflects network distance, not query work.
 *
 * Usage:
 *   node scripts/benchmarkDbLatency.js "<mongodb-uri>"
 *   node scripts/benchmarkDbLatency.js "<mongodb-uri>" 100      # custom sample count
 *
 * Run it from your laptop AND from AWS CloudShell (us-east-1) against the SAME
 * cluster to see how latency depends on where the "server" sits.
 */

const mongoose = require('mongoose');

(async () => {
  const uri = process.argv[2] || process.env.MONGODB_URI;
  const N = Number(process.argv[3]) || 50;

  if (!uri) {
    console.error('Provide a MongoDB URI as the first argument or via MONGODB_URI.');
    process.exit(1);
  }

  const safeHost = (() => {
    try {
      return new URL(uri.replace('mongodb+srv://', 'https://')).host;
    } catch {
      return '(unknown host)';
    }
  })();

  console.log(`Connecting to ${safeHost} ...`);
  const startConnect = process.hrtime.bigint();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const connectMs = Number(process.hrtime.bigint() - startConnect) / 1e6;
  console.log(`Initial connect (handshake + auth): ${connectMs.toFixed(0)}ms\n`);

  const admin = mongoose.connection.db.admin();

  // Warm up (ignore first call — it can include lazy socket setup).
  await admin.ping();

  const times = [];
  for (let i = 0; i < N; i++) {
    const s = process.hrtime.bigint();
    await admin.ping();
    times.push(Number(process.hrtime.bigint() - s) / 1e6);
  }

  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const pct = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];

  console.log(`Round-trip latency over ${N} pings:`);
  console.log(`  min  = ${times[0].toFixed(1)} ms`);
  console.log(`  avg  = ${(sum / N).toFixed(1)} ms`);
  console.log(`  p50  = ${pct(0.5).toFixed(1)} ms`);
  console.log(`  p95  = ${pct(0.95).toFixed(1)} ms`);
  console.log(`  max  = ${times[times.length - 1].toFixed(1)} ms`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
