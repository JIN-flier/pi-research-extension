/** ARIS 原生工具模块；下方中文注释说明接口约定与关键边界。 */
/** Expose the installed package's Python helpers. This never selects a project
 * or changes where reviewer settings and sessions are stored. */
/** 设置旧版 helper 的包根路径；保留用户显式设置的 ARIS_REPO，不改变研究项目目录。 */
export function configureArisRepo(
  packageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  env.ARIS_REPO ||= packageRoot;
  return env.ARIS_REPO;
}
