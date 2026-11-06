import { version } from "../package.json";
import { customStylesManager } from "./modules/customStyles";
import { licenseManager } from "./modules/license";
import { getString, initLocale } from "./utils/locale";
import { csLog, getFormattedLogs } from "./utils/logger";
import { getColors, isDarkMode } from "./utils/theme";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  const mainWin = Zotero.getMainWindows()[0] as unknown as Window;
  const dark = mainWin ? isDarkMode(mainWin) : false;
  const icon = dark ? "citation-styler-favicon-96-white.png" : "favicon.png";

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/${icon}`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // ── Open prefs pane on first install ──────────────────────────
  const isFirstInstall = !Zotero.Prefs.get(
    "extensions.citationstyler.installed",
  );
  if (isFirstInstall) {
    Zotero.Prefs.set("extensions.citationstyler.installed", true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    Zotero.Utilities.Internal.openPreferences(addon.data.config.addonRef);
  }

  csLog("INFO", `Plugin started — version ${version}`);
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  if (type !== "load") return;

  await new Promise((resolve) => data.window.setTimeout(resolve, 100));

  const win: Window = data.window;
  const doc: Document = win.document;

  const versionEl = doc.getElementById("prefs-version") as HTMLElement;
  if (versionEl) {
    versionEl.textContent = `v${version}`;
    versionEl.style.color = getColors(win).mutedText;
  }

  const verifyBtn = doc.getElementById("prefs-verify-btn") as HTMLElement;
  const emailInput = doc.getElementById(
    "prefs-email-input",
  ) as HTMLInputElement;
  const licenseInput = doc.getElementById(
    "prefs-license-input",
  ) as HTMLInputElement;
  const statusDiv = doc.getElementById("prefs-status") as HTMLElement;
  const stylesContainer = doc.getElementById(
    "prefs-styles-container",
  ) as HTMLElement;
  const logoutBtn = doc.getElementById("prefs-logout-btn") as HTMLElement;
  const updateRow = doc.getElementById("prefs-update-row") as HTMLElement;
  const updateBtn = doc.getElementById(
    "prefs-check-updates-btn",
  ) as HTMLElement;
  const updateStatus = doc.getElementById("prefs-update-status") as HTMLElement;

  if (
    !verifyBtn ||
    !emailInput ||
    !licenseInput ||
    !statusDiv ||
    !stylesContainer
  ) {
    csLog(
      "ERROR",
      "Prefs elements not found — preferences pane may not have loaded correctly",
    );
    return;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showUpdateRow() {
    if (updateRow) {
      updateRow.style.display = "flex";
      updateRow.style.alignItems = "center";
    }
  }

  function hideUpdateRow() {
    if (updateRow) updateRow.style.display = "none";
    if (updateStatus) updateStatus.textContent = "";
  }

  /**
   * The styles list and "Check for Updates" always use the saved (verified)
   * credentials. If the fields no longer match them, lock both until the
   * user presses Verify, so what's shown is always what's used.
   */
  let statusBeforeLock: { text: string; color: string } | null = null;
  function syncCredentialsLock() {
    const s = licenseManager.loadCredentials();
    const changed =
      !!s &&
      (emailInput.value.trim() !== s.email ||
        licenseInput.value.trim() !== s.licenseKey);
    const lockMsg = getString("status-credentials-changed");

    for (const el of [stylesContainer, updateRow]) {
      if (!el) continue;
      el.toggleAttribute("inert", changed);
      el.style.opacity = changed ? "0.5" : "";
    }

    if (changed && !statusBeforeLock) {
      statusBeforeLock = {
        text: statusDiv.textContent ?? "",
        color: statusDiv.style.color,
      };
      statusDiv.textContent = lockMsg;
      statusDiv.style.color = getColors(win).warning;
    } else if (!changed && statusBeforeLock) {
      // Restore the previous status, unless something else replaced ours
      if (statusDiv.textContent === lockMsg) {
        statusDiv.textContent = statusBeforeLock.text;
        statusDiv.style.color = statusBeforeLock.color;
      }
      statusBeforeLock = null;
    }
  }
  emailInput.addEventListener("input", syncCredentialsLock);
  licenseInput.addEventListener("input", syncCredentialsLock);

  /** Ignores clicks while the previous click's work is still running. */
  function onClickExclusive(btn: HTMLElement, handler: () => Promise<void>) {
    let busy = false;
    btn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      btn.setAttribute("disabled", "true");
      try {
        await handler();
      } finally {
        busy = false;
        btn.removeAttribute("disabled");
      }
    });
  }

  // ── Set placeholders from locale ──────────────────────────────────────────
  emailInput.placeholder = getString("email-placeholder");
  licenseInput.placeholder = getString("license-placeholder");

  csLog("INFO", "Preferences pane loaded");

  // ── Pre-fill saved credentials ────────────────────────────────────────────
  const saved = licenseManager.loadCredentials();
  if (saved) {
    csLog("INFO", "Saved credentials found — attempting cache validation");
    emailInput.value = saved.email;
    licenseInput.value = saved.licenseKey;
  } else {
    csLog("INFO", "No saved credentials");
  }

  // ── Warn if not logged into Zotero (never disable the button) ────────────
  const zoteroUserId = licenseManager.getZoteroUserId();
  if (!zoteroUserId) {
    csLog("WARN", "No Zotero user ID — user may not be logged in");
    statusDiv.textContent = getString("status-no-zotero");
    statusDiv.style.color = getColors(win).error;
  }

  // ── Load from cache if credentials already saved ──────────────────────────
  if (saved && zoteroUserId) {
    try {
      const cached = await licenseManager.validate(
        { email: saved.email, licenseKey: saved.licenseKey, zoteroUserId },
        false,
      );
      if (cached.valid) {
        if (cached.fromGrace) {
          statusDiv.textContent = getString("status-grace-period");
          statusDiv.style.color = getColors(win).warning;
        } else if (licenseManager.isCacheExpiringSoon()) {
          statusDiv.textContent = getString("status-verified-soon");
          statusDiv.style.color = getColors(win).warning;
        } else {
          statusDiv.textContent = getString("status-verified");
          statusDiv.style.color = getColors(win).success;
        }
        await customStylesManager.renderStylesInPrefs(
          doc,
          win,
          stylesContainer,
          statusDiv,
          cached,
          saved.licenseKey,
        );
        showUpdateRow();
      }
    } catch (e) {
      csLog("ERROR", "Cache load error:", e);
      statusDiv.textContent = getString("status-cache-error");
      statusDiv.style.color = getColors(win).error;
    }
  }

  // ── Verify button ─────────────────────────────────────────────────────────
  onClickExclusive(verifyBtn, async () => {
    const email = emailInput.value.trim();
    const licenseKey = licenseInput.value.trim();
    csLog("INFO", `Verify button clicked — key length: ${licenseKey.length}`);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusDiv.textContent = getString("status-invalid-email");
      statusDiv.style.color = getColors(win).error;
      return;
    }
    if (!licenseKey) {
      statusDiv.textContent = getString("status-missing-license");
      statusDiv.style.color = getColors(win).error;
      return;
    }

    const zoteroUserId = licenseManager.getZoteroUserId();
    if (!zoteroUserId) {
      statusDiv.textContent = getString("status-no-zotero");
      statusDiv.style.color = getColors(win).error;
      return;
    }

    statusDiv.textContent = getString("status-verifying");
    statusDiv.style.color = getColors(win).neutral;
    stylesContainer.innerHTML = "";
    hideUpdateRow();

    try {
      const result = await licenseManager.validate(
        { email, licenseKey, zoteroUserId },
        true,
      );

      if (!result.valid) {
        csLog("WARN", `Verification failed: ${result.reason}`);
        statusDiv.textContent =
          result.reason ?? getString("status-validation-failed");
        statusDiv.style.color = getColors(win).error;
        return;
      }

      csLog("INFO", "Credentials saved after successful verification");
      licenseManager.saveCredentials(email, licenseKey);
      syncCredentialsLock(); // fields now match the saved credentials

      await customStylesManager.renderStylesInPrefs(
        doc,
        win,
        stylesContainer,
        statusDiv,
        result,
        licenseKey,
      );

      showUpdateRow();
    } catch (e) {
      csLog("ERROR", "Verify error:", e);
      statusDiv.textContent = getString("status-verify-error");
      statusDiv.style.color = getColors(win).error;
    }
  });

  // ── Check for Updates button ──────────────────────────────────────────────
  if (updateBtn)
    onClickExclusive(updateBtn, async () => {
      // Use the saved (verified) key, not whatever is typed in the field
      const saved = licenseManager.loadCredentials();
      if (!saved) {
        updateStatus.textContent = getString("status-missing-credentials");
        updateStatus.style.color = getColors(win).error;
        return;
      }
      const licenseKey = saved.licenseKey;

      updateStatus.textContent = getString("status-verifying");
      updateStatus.style.color = getColors(win).neutral;

      try {
        const updatedCount = await customStylesManager.checkAndInstallUpdates(
          doc,
          win,
          stylesContainer,
          statusDiv,
          licenseKey,
        );

        csLog(
          "INFO",
          `Update check complete — ${updatedCount} updates available`,
        );
        if (updatedCount === 0) {
          updateStatus.textContent = getString("status-all-uptodate");
          updateStatus.style.color = getColors(win).success;
        } else {
          updateStatus.textContent = getString("status-updates-available", {
            args: { count: updatedCount },
          });
          updateStatus.style.color = getColors(win).warning;
        }
      } catch (e) {
        updateStatus.textContent = getString("status-update-failed");
        updateStatus.style.color = getColors(win).error;
      }
    });

  // ── Clear Credentials button ──────────────────────────────────────────────
  logoutBtn?.addEventListener("click", () => {
    csLog("INFO", "Credentials cleared by user");
    licenseManager.clearCredentials();
    emailInput.value = "";
    licenseInput.value = "";
    syncCredentialsLock(); // nothing saved any more, so unlock
    stylesContainer.innerHTML = "";
    statusDiv.textContent = getString("status-credentials-cleared");
    statusDiv.style.color = getColors(win).neutral;
    hideUpdateRow();
  });

  // ── Copy Logs button ──────────────────────────────────────────────────────
  const copyLogsBtn = doc.getElementById("prefs-copy-logs-btn") as HTMLElement;
  const logsStatusDiv = doc.getElementById("prefs-logs-status") as HTMLElement;

  copyLogsBtn?.addEventListener("click", async () => {
    const text = getFormattedLogs();
    try {
      await (win as any).navigator.clipboard.writeText(text);
    } catch {
      // Fallback for chrome:// contexts
      const ta = doc.createElement("textarea");
      ta.value = text;
      doc.documentElement!.appendChild(ta);
      (ta as any).select();
      doc.execCommand("copy");
      doc.documentElement!.removeChild(ta);
    }
    csLog("INFO", "Log export copied to clipboard by user");
    if (logsStatusDiv) {
      logsStatusDiv.textContent = getString("status-logs-copied");
      logsStatusDiv.style.color = getColors(win).success;
      win.setTimeout(() => {
        logsStatusDiv.textContent = "";
      }, 3000);
    }
  });
}

function onShortcuts(type: string) {
  // Reserved for future keyboard shortcuts
}

function onDialogEvents(type: string) {
  // Reserved for future dialog events
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
