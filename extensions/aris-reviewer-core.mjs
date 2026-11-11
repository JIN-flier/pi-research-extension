import path from 'node:path';

export function configureArisRepo(packageRoot, env = process.env) {
  env.ARIS_REPO ||= packageRoot;
  return env.ARIS_REPO;
}

export function parseModelRef(reference) {
  const slash = reference.indexOf('/');
  if (slash < 1 || slash === reference.length - 1) {
    throw new Error('Reviewer model must be provider/model');
  }
  return { provider: reference.slice(0, slash), id: reference.slice(slash + 1) };
}

export function safeInputPath(project, candidate) {
  const absolute = path.resolve(project, candidate);
  const relative = path.relative(path.resolve(project), absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Reviewer input is outside the project');
  }
  return absolute;
}

export function nextHistory(history, prompt, response) {
  return [...history, { role: 'user', text: prompt }, { role: 'assistant', text: response }];
}
