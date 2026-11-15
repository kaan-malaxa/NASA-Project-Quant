/**
 * The site's public address, for links people take away (QR code, Season Brief footer): VITE_SITE_URL from the
 * build (https://kaan-malaxa.github.io/NASA-Project-Quant/ in CI), else the address this page was opened at
 * (local development). Always ends with "/".
 */
export function siteUrl() {
  const fromBuild = import.meta.env.VITE_SITE_URL;
  if (fromBuild) return String(fromBuild).replace(/\/?$/, "/");
  if (typeof window === "undefined") return "";
  return (window.location.origin + window.location.pathname).replace(/\/?$/, "/");
}
