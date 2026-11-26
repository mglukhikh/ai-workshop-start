import { openGitHubTarget, parseGitHubOrganization, parseGitHubUrl, type GitHubOptions } from './core/github.ts';
import { openDirectory } from './local.ts';

export function openTarget(input: string, options: GitHubOptions) {
  if (parseGitHubUrl(input) || parseGitHubOrganization(input)) {
    return openGitHubTarget(input, options);
  }
  return openDirectory(input);
}
