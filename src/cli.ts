#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the local web view. Nothing is stored.
import { run } from './commands.ts';
import type { GitHubOptions } from './core/github.ts';
import { openTarget } from './open.ts';
import { serve } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string, options?: Pick<GitHubOptions, 'signal' | 'onOrganizationProgress'>) =>
  openTarget(input, { fetch, token, ...options });

process.exitCode = await run(process.argv.slice(2), {
  open,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  // The server keeps the process running until it is stopped, with Ctrl+C.
  serve: async (port) => (await serve({ open, port })).url,
});
