/* Minimal test harness: `npm test` runs every suite with tsx, no framework needed. */

type Fn = () => void | Promise<void>;
const tests: { suite: string; name: string; fn: Fn }[] = [];
let currentSuite = "";

export function suite(name: string, body: () => void) {
  currentSuite = name;
  body();
}

export function test(name: string, fn: Fn) {
  tests.push({ suite: currentSuite, name, fn });
}

export function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export async function run() {
  let failed = 0;
  let last = "";
  for (const t of tests) {
    if (t.suite !== last) {
      console.log(`\n${t.suite}`);
      last = t.suite;
    }
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${t.name}\n      ${(err as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  if (failed) process.exit(1);
}
