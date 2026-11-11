export function configureArisRepo(packageRoot: string, env?: NodeJS.ProcessEnv): string;
export function parseModelRef(reference: string): { provider: string; id: string };
export function safeInputPath(project: string, candidate: string): string;
export function nextHistory(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  prompt: string,
  response: string,
): Array<{ role: 'user' | 'assistant'; text: string }>;
