import { csLog } from "../utils/logger";
import { sha256Hex } from "../utils/hash";

const PREF_LICENSE_KEY = "extensions.citationstyler.licenseKey";
const PREF_EMAIL = "extensions.citationstyler.email";
const PREF_ZOTERO_USER_ID = "extensions.citationstyler.zoteroUserId";
const PREF_CACHE_VALID = "extensions.citationstyler.cacheValid";
const PREF_CACHE_EXPIRY = "extensions.citationstyler.cacheExpiry";
// Fingerprint of the credentials that earned the cached "valid" status
const PREF_CACHE_OWNER = "extensions.citationstyler.cacheOwner";

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const WARN_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 15_000;

export interface LicenseCredentials {
  email: string;
  licenseKey: string;
  zoteroUserId: string;
}

export interface LicenseStatus {
  valid: boolean;
  reason?: string;
  styles?: string[];
  fromGrace?: boolean;
}

export class LicenseManager {
  // ─── Zotero User ID ───────────────────────────────────────────

  getZoteroUserId(): string | null {
    try {
      const zotero = ztoolkit.getGlobal("Zotero");
      const id = zotero.Users.getCurrentUserID();
      return id ? String(id) : null;
    } catch (e) {
      csLog("ERROR", "getZoteroUserId error:", e);
      return null;
    }
  }

  // ─── Credential Storage ───────────────────────────────────────

  saveCredentials(email: string, licenseKey: string) {
    Zotero.Prefs.set(PREF_EMAIL, email);
    Zotero.Prefs.set(PREF_LICENSE_KEY, licenseKey);
  }

  loadCredentials(): { email: string; licenseKey: string } | null {
    const email = Zotero.Prefs.get(PREF_EMAIL) as string;
    const licenseKey = Zotero.Prefs.get(PREF_LICENSE_KEY) as string;
    if (!email || !licenseKey) return null;
    return { email, licenseKey };
  }

  clearCredentials() {
    Zotero.Prefs.clear(PREF_EMAIL);
    Zotero.Prefs.clear(PREF_LICENSE_KEY);
    this.clearCache();
  }

  // ─── Cache ────────────────────────────────────────────────────

  private fingerprint(credentials: LicenseCredentials): Promise<string> {
    return sha256Hex(
      [
        credentials.email.trim().toLowerCase(),
        credentials.licenseKey.trim(),
        credentials.zoteroUserId,
      ].join("\n"),
    );
  }

  private clearCache() {
    Zotero.Prefs.clear(PREF_CACHE_VALID);
    Zotero.Prefs.clear(PREF_CACHE_EXPIRY);
    Zotero.Prefs.clear(PREF_CACHE_OWNER);
  }

  private async setCacheValid(
    credentials: LicenseCredentials,
    styles: string[],
  ) {
    Zotero.Prefs.set(PREF_CACHE_VALID, JSON.stringify(styles));
    Zotero.Prefs.set(PREF_CACHE_EXPIRY, String(Date.now() + CACHE_TTL_MS));
    Zotero.Prefs.set(PREF_CACHE_OWNER, await this.fingerprint(credentials));
  }

  /**
   * Returns the cached status only if it was earned by these exact
   * credentials. `allowGrace` also accepts a cache up to GRACE_PERIOD_MS
   * past its expiry (used when the server is unreachable).
   */
  private async getCachedStatus(
    credentials: LicenseCredentials,
    allowGrace: boolean,
  ): Promise<LicenseStatus | null> {
    try {
      const expiry = Number(Zotero.Prefs.get(PREF_CACHE_EXPIRY));
      const cached = Zotero.Prefs.get(PREF_CACHE_VALID) as string;
      const owner = Zotero.Prefs.get(PREF_CACHE_OWNER) as string;
      if (!expiry || !cached || !owner) return null;
      if (owner !== (await this.fingerprint(credentials))) {
        csLog("INFO", "Cached license belongs to different credentials");
        return null;
      }
      const now = Date.now();
      const limit = allowGrace ? expiry + GRACE_PERIOD_MS : expiry;
      if (now > limit) return null;
      return {
        valid: true,
        styles: JSON.parse(cached),
        fromGrace: now > expiry,
      };
    } catch (e) {
      return null;
    }
  }

  isCacheExpiringSoon(): boolean {
    const expiry = Number(Zotero.Prefs.get(PREF_CACHE_EXPIRY));
    if (!expiry) return true;
    return Date.now() > expiry - WARN_BEFORE_MS;
  }

  isCacheInGrace(): boolean {
    const expiry = Number(Zotero.Prefs.get(PREF_CACHE_EXPIRY));
    if (!expiry) return false;
    const now = Date.now();
    return now > expiry && now <= expiry + GRACE_PERIOD_MS;
  }

  getCacheExpiryDate(): Date | null {
    const expiry = Number(Zotero.Prefs.get(PREF_CACHE_EXPIRY));
    return expiry ? new Date(expiry) : null;
  }

  // ─── Validation ───────────────────────────────────────────────

  async validate(
    credentials: LicenseCredentials,
    forceRefresh = false,
  ): Promise<LicenseStatus> {
    csLog(
      "INFO",
      `License validation requested — forceRefresh: ${forceRefresh}`,
    );

    if (!forceRefresh) {
      const cached = await this.getCachedStatus(credentials, false);
      if (cached) {
        csLog("INFO", "License validation served from cache");
        return cached;
      }
    }

    if (!credentials.zoteroUserId) {
      return {
        valid: false,
        reason:
          "Please log in to your Zotero account at zotero.org to use purchased styles.",
      };
    }

    try {
      const zotero = ztoolkit.getGlobal("Zotero");
      const response = (await zotero.HTTP.request(
        "POST",
        `${API_BASE}/license/validate`,
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            license_key: credentials.licenseKey,
            zotero_user_id: credentials.zoteroUserId,
          }),
          responseType: "json",
          // Built-in timeout aborts the request (Zotero.HTTP.TimeoutException)
          timeout: REQUEST_TIMEOUT,
        },
      )) as any;

      const data = response.response as unknown as {
        valid: boolean;
        reason?: string;
        styles?: string[];
      };

      if (data.valid) {
        csLog(
          "INFO",
          `License validated via API — styles count: ${data.styles?.length ?? 0}`,
        );
        await this.setCacheValid(credentials, data.styles ?? []);
        return { valid: true, styles: data.styles ?? [] };
      } else {
        // Only drop the cache if these are the credentials that earned it
        // (e.g. license revoked) — a typo in the key must not wipe it.
        const owner = Zotero.Prefs.get(PREF_CACHE_OWNER) as string;
        if (owner && owner === (await this.fingerprint(credentials))) {
          csLog("INFO", "Cached license cleared — server rejected its owner");
          this.clearCache();
        }
        return {
          valid: false,
          reason: data.reason ?? "License validation failed.",
        };
      }
    } catch (e: any) {
      // Zotero.HTTP.request throws on non-2xx; check for a 429 with a reason
      if (e?.status === 429 || e?.xmlhttp?.status === 429) {
        const xhr = e?.xmlhttp ?? e;
        let reason: string | undefined;
        try {
          const body =
            typeof xhr.response === "string"
              ? JSON.parse(xhr.response)
              : xhr.response;
          reason = body?.reason;
        } catch {
          /* ignore parse errors */
        }
        csLog("WARN", "License validation rejected with 429:", reason ?? e);
        return {
          valid: false,
          reason: reason ?? "Too many requests. Please try again later.",
        };
      }

      csLog(
        "ERROR",
        "License validation error — attempting grace period fallback:",
        e,
      );

      // Only these exact credentials may fall back to the cache
      const grace = await this.getCachedStatus(credentials, true);
      if (grace) {
        csLog(
          "WARN",
          grace.fromGrace
            ? "Server unreachable — serving from grace period (cache expired)"
            : "Server unreachable — serving from valid cache",
        );
        return grace;
      }

      return {
        valid: false,
        reason:
          "Could not reach the license server. Please check your connection.",
      };
    }
  }
}

export const licenseManager = new LicenseManager();

export const API_BASE = "https://citationstyler.com/wp-json/citationstyler/v1";
