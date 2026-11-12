/** Expose the installed package's Python helpers. This never selects a project
 * or changes where reviewer settings and sessions are stored. */
export function configureArisRepo(
  packageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  env.ARIS_REPO ||= packageRoot;
  return env.ARIS_REPO;
}
