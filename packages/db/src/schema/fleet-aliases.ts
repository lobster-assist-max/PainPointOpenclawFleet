/**
 * Fleet terminology aliases.
 *
 * Fleet Dashboard uses "Fleet" instead of "Company" and "Bot" instead of "Agent".
 * These re-exports let new Fleet-specific code import the familiar names without
 * renaming the underlying DB tables or breaking existing migrations.
 */

export { companies as fleets } from "./companies.js";
export { agents as bots } from "./agents.js";
export { companyMemberships as fleetMemberships } from "./company_memberships.js";
export { companySecrets as fleetSecrets } from "./company_secrets.js";
export { companySecretVersions as fleetSecretVersions } from "./company_secret_versions.js";
export { companyLogos as fleetLogos } from "./company_logos.js";
