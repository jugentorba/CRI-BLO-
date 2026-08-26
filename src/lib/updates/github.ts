export const CRI_BLO_VERSION = "0.1.0";
export const CRI_BLO_RELEASE_REPOSITORY = "jugentorba/CRI-BLO-";

const LATEST_RELEASE_API = `https://api.github.com/repos/${CRI_BLO_RELEASE_REPOSITORY}/releases/latest`;

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  content_type?: string;
  size?: number;
}

interface GitHubLatestReleaseResponse {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  body?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GitHubReleaseAsset[];
}

export type AppPlatform = "android" | "ios" | "web";

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseName: string;
  releaseUrl: string;
  publishedAt?: string;
  notes?: string;
  platform: AppPlatform;
  downloadUrl?: string;
  downloadName?: string;
}

function versionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const next = a[i] ?? 0;
    const installed = b[i] ?? 0;
    if (next > installed) return true;
    if (next < installed) return false;
  }
  return false;
}

export function detectAppPlatform(): AppPlatform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "web";
}

function selectAsset(assets: GitHubReleaseAsset[], platform: AppPlatform): GitHubReleaseAsset | undefined {
  if (platform === "android") {
    return assets.find(
      (asset) =>
        asset.name.toLowerCase().endsWith(".apk") ||
        asset.content_type === "application/vnd.android.package-archive",
    );
  }

  if (platform === "ios") {
    return assets.find((asset) => asset.name.toLowerCase().endsWith(".ipa"));
  }

  return undefined;
}

export async function checkForAppUpdate(signal?: AbortSignal): Promise<AppUpdateInfo> {
  const response = await fetch(LATEST_RELEASE_API, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
    signal,
  });

  if (response.status === 404) {
    throw new Error("Aucune version CRI-BLO n'est encore publiée dans GitHub Releases.");
  }

  if (!response.ok) {
    throw new Error(`Impossible de vérifier les mises à jour (${response.status}).`);
  }

  const release = (await response.json()) as GitHubLatestReleaseResponse;
  const latestVersion = release.tag_name?.trim();
  const releaseUrl = release.html_url?.trim();

  if (!latestVersion || !releaseUrl || release.draft) {
    throw new Error("La dernière version GitHub n'est pas exploitable.");
  }

  const platform = detectAppPlatform();
  const asset = selectAsset(release.assets ?? [], platform);

  return {
    currentVersion: CRI_BLO_VERSION,
    latestVersion,
    updateAvailable: isNewerVersion(latestVersion, CRI_BLO_VERSION),
    releaseName: release.name?.trim() || latestVersion,
    releaseUrl,
    publishedAt: release.published_at,
    notes: release.body,
    platform,
    downloadUrl: asset?.browser_download_url,
    downloadName: asset?.name,
  };
}

export async function refreshPwaServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  await registration.update();
}
