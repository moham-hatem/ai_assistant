/** Simple compatibility identifiers. Increment only when the API contract breaks. */
export const CLIENT_API_VERSION = '1' as const;
export const API_VERSION = '1' as const;

export const COMPATIBLE_CLIENT_VERSIONS: readonly string[] = Object.freeze([
  CLIENT_API_VERSION,
]);

export interface ApiVersionContract {
  readonly apiVersion: string;
  readonly compatibleClientVersions: readonly string[];
}

export const API_VERSION_CONTRACT: ApiVersionContract = Object.freeze({
  apiVersion: API_VERSION,
  compatibleClientVersions: COMPATIBLE_CLIENT_VERSIONS,
});
