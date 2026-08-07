/**
 * Resolve a boolean trading flag from plugin config.
 *
 * - If the key is present on the config object (including schema default false), that wins.
 * - Env is bootstrap only when the key has never been set (first-run installs).
 * - Missing / invalid values fail closed to false once the key exists.
 */
export function resolveAllowTrading(
  config: Record<string, unknown>,
  key: string,
  envValue: string | undefined,
): boolean {
  if (Object.prototype.hasOwnProperty.call(config, key)) {
    const value = config[key];
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return false;
  }
  return envValue === "true" || envValue === "1";
}
