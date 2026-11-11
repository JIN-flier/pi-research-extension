export function configureArisRepo(packageRoot: string, env?: NodeJS.ProcessEnv): string;
export function parseModelRef(reference: string): { provider: string; id: string };
export function safeInputPath(project: string, candidate: string): string;
export function nextHistory(
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  prompt: string,
  response: string,
): Array<{ role: 'user' | 'assistant'; text: string }>;

export type ReviewSessionResult = {
  status: 'ok' | 'error' | 'aborted';
  threadId: string;
  requestedModel: string;
  reportedModel: string | null;
  stopReason: string | null;
  answer?: string;
  error?: string;
};

export function runReviewSession(options: {
  project: string;
  prompt: string;
  files?: string[];
  threadId?: string;
  requestedModel: string;
  complete: (prompt: string) => Promise<{
    provider?: string;
    model?: string;
    stopReason?: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
}): Promise<ReviewSessionResult>;
