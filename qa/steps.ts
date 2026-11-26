// Runs a sequence of browser steps given on the command line, against a freshly started server.
//   node qa/steps.ts <step> [args…] <step> [args…] …
// Steps (selectors are Playwright selectors: `#repo`, `text=Scan`, `role=button[name="Scan"]`):
//   open [path]                    open a page path, `/` by default; e.g. `open "/?repo=./fixture"`
//   fill <selector> <text>         type into a field, replacing its value
//   click <selector>               press a button or any element
//   press <selector> <key>         a key in an element, e.g. `press #repo Enter`
//   expect <selector> <text>       wait until the element's text contains <text>
//   value <selector> <text>        wait until the field's value is exactly <text>
//   count <selector> <n>           wait until exactly <n> elements match
//   visible <selector>             wait until the element is visible
//   hidden <selector>              wait until the element is hidden
//   enabled <selector>             wait until the element is enabled
//   report                         print the status, warnings, skills and the selected skill
//   shot <file.png>                save a screenshot under qa/out
//   wait <ms>                      sleep
//   pause                          wait for Enter, e.g. to look at a headed browser
// Relative directories are relative to the repository root, where the server runs.
// Exits with 1 if any check fails.
import { session, waitForEnter, type Tester } from './lib.ts';

type Step = { arity: number; run(tester: Tester, args: string[]): Promise<unknown> };
const STEPS: Record<string, Step> = {
  open: { arity: -1, run: (t, [path]) => t.open(path ?? '/') },
  fill: { arity: 2, run: (t, [selector, text]) => t.fill(selector, text) },
  click: { arity: 1, run: (t, [selector]) => t.click(selector) },
  press: { arity: 2, run: (t, [selector, key]) => t.press(selector, key) },
  expect: { arity: 2, run: (t, [selector, text]) => t.expectText(selector, text) },
  value: { arity: 2, run: (t, [selector, text]) => t.expectValue(selector, text) },
  count: { arity: 2, run: (t, [selector, n]) => t.expectCount(selector, Number(n)) },
  visible: { arity: 1, run: (t, [selector]) => t.expectVisible(selector) },
  hidden: { arity: 1, run: (t, [selector]) => t.expectHidden(selector) },
  enabled: { arity: 1, run: (t, [selector]) => t.expectEnabled(selector) },
  report: { arity: 0, run: (t) => t.report() },
  shot: { arity: 1, run: (t, [file]) => t.screenshot(file) },
  wait: { arity: 1, run: (_, [ms]) => new Promise((resolve) => setTimeout(resolve, Number(ms))) },
  pause: { arity: 0, run: () => waitForEnter('Paused. Press Enter to continue.') },
};

/** Splits the arguments into steps; `open` takes its path only if the next word is not a step. */
function parse(args: string[]): { name: string; args: string[] }[] {
  const steps = [];
  for (let i = 0; i < args.length;) {
    const name = args[i++];
    const step = STEPS[name];
    if (!step) throw new Error(`Unknown step "${name}". Steps: ${Object.keys(STEPS).join(', ')}`);
    const arity = step.arity >= 0 ? step.arity : (i < args.length && !(args[i] in STEPS) ? 1 : 0);
    if (i + arity > args.length) throw new Error(`"${name}" needs ${arity} argument(s)`);
    if (name === 'count') {
      const count = Number(args[i + 1]);
      if (!args[i + 1].trim() || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('"count" requires a non-negative safe integer');
      }
    }
    steps.push({ name, args: args.slice(i, i + arity) });
    i += arity;
  }
  return steps;
}

let steps: ReturnType<typeof parse>;
try {
  steps = parse(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}
if (steps.length === 0) {
  console.log('Usage: node qa/steps.ts open fill "#repo" ./fixture click "#scan" expect "#status" "5 skills" report');
  process.exit(2);
}
if (steps[0].name !== 'open') steps.unshift({ name: 'open', args: [] });

const failures = await session(async (tester) => {
  for (const { name, args } of steps) {
    try {
      await STEPS[name].run(tester, args);
    } catch (error) {
      // An action that cannot run, such as a click on a hidden element: the later steps depend on it.
      tester.failures++;
      console.log(`  FAIL ${name}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
      return;
    }
  }
});
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exitCode = failures ? 1 : 0;
