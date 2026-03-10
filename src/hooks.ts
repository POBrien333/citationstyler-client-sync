import { customStylesManager } from "./modules/customStyles";
import { licenseManager }       from "./modules/license";
import { getString, initLocale } from "./utils/locale";
import { createZToolkit }        from "./utils/ztoolkit";


async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // ── Open prefs pane on first install ──────────────────────────
  const isFirstInstall = !Zotero.Prefs.get("extensions.citationstyler.installed");
  if (isFirstInstall) {
    Zotero.Prefs.set("extensions.citationstyler.installed", true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    Zotero.Utilities.Internal.openPreferences(addon.data.config.addonRef);
  }

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

  await new Promise(resolve => data.window.setTimeout(resolve, 100));

  const doc: Document = data.window.document;

  const verifyBtn       = doc.getElementById("prefs-verify-btn")       as HTMLElement;
  const emailInput      = doc.getElementById("prefs-email-input")       as HTMLInputElement;
  const licenseInput    = doc.getElementById("prefs-license-input")     as HTMLInputElement;
  const statusDiv       = doc.getElementById("prefs-status")            as HTMLElement;
  const stylesContainer = doc.getElementById("prefs-styles-container")  as HTMLElement;
  const logoutBtn       = doc.getElementById("prefs-logout-btn")        as HTMLElement;
  const updateRow       = doc.getElementById("prefs-update-row")        as HTMLElement;
  const updateBtn       = doc.getElementById("prefs-check-updates-btn") as HTMLElement;
  const updateStatus    = doc.getElementById("prefs-update-status")     as HTMLElement;

  if (!verifyBtn || !emailInput || !licenseInput || !statusDiv || !stylesContainer) {
    ztoolkit.log("❌ Prefs elements not found");
    return;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showUpdateRow() {
    if (updateRow) {
      updateRow.style.display    = "flex";
      updateRow.style.alignItems = "center";
    }
  }

  function hideUpdateRow() {
    if (updateRow) updateRow.style.display = "none";
    if (updateStatus) updateStatus.textContent = "";
  }

  // ── Set placeholders from locale ──────────────────────────────────────────
  emailInput.placeholder   = getString("email-placeholder");
  licenseInput.placeholder = getString("license-placeholder");

  // ── Pre-fill saved credentials ────────────────────────────────────────────
  const saved = licenseManager.loadCredentials();
  if (saved) {
    emailInput.value   = saved.email;
    licenseInput.value = saved.licenseKey;
  }

  // ── Warn if not logged into Zotero (never disable the button) ────────────
  const zoteroUserId = licenseManager.getZoteroUserId();
  if (!zoteroUserId) {
    statusDiv.textContent = getString("status-no-zotero");
    statusDiv.style.color = "#dc3545";
  }

  // ── Load from cache if credentials already saved ──────────────────────────
if (saved && zoteroUserId) {
    try {
        const cached = await licenseManager.validate(
            { email: saved.email, licenseKey: saved.licenseKey, zoteroUserId },
            false
        );
        if (cached.valid) {
            if (cached.fromGrace) {
                statusDiv.textContent = getString("status-grace-period");
                statusDiv.style.color = "#fd7e14";
            } else if (licenseManager.isCacheExpiringSoon()) {
                statusDiv.textContent = getString("status-verified-soon");
                statusDiv.style.color = "#fd7e14";
            } else {
                statusDiv.textContent = getString("status-verified");
                statusDiv.style.color = "#28a745";
            }
            await customStylesManager.renderStylesInPrefs(
                doc, stylesContainer, statusDiv, cached, saved.licenseKey
            );
            showUpdateRow();
        }
    } catch (e) {
        ztoolkit.log("❌ Cache load error:", e);
        statusDiv.textContent = getString("status-cache-error");
        statusDiv.style.color = "#dc3545";
    }
}


  // ── Verify button ─────────────────────────────────────────────────────────
  verifyBtn.addEventListener("click", async () => {
    const email      = emailInput.value.trim();
    const licenseKey = licenseInput.value.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusDiv.textContent = getString("status-invalid-email");
      statusDiv.style.color = "#dc3545";
      return;
    }
    if (!licenseKey) {
      statusDiv.textContent = getString("status-missing-license");
      statusDiv.style.color = "#dc3545";
      return;
    }

    const zoteroUserId = licenseManager.getZoteroUserId();
    if (!zoteroUserId) {
      statusDiv.textContent = getString("status-no-zotero");
      statusDiv.style.color = "#dc3545";
      return;
    }

    statusDiv.textContent     = getString("status-verifying");
    statusDiv.style.color     = "#888";
    stylesContainer.innerHTML = "";
    hideUpdateRow();

    try {
      const result = await licenseManager.validate(
        { email, licenseKey, zoteroUserId },
        true
      );

      if (!result.valid) {
        statusDiv.textContent = result.reason ?? getString("status-validation-failed");
        statusDiv.style.color = "#dc3545";
        return;
      }

      licenseManager.saveCredentials(email, licenseKey);

      await customStylesManager.renderStylesInPrefs(
        doc, stylesContainer, statusDiv, result, licenseKey
      );

      showUpdateRow();
    } catch (e) {
      ztoolkit.log("❌ Verify error:", e);
      statusDiv.textContent = getString("status-verify-error");
      statusDiv.style.color = "#dc3545";
    }
  });

  // ── Check for Updates button ──────────────────────────────────────────────
  updateBtn?.addEventListener("click", async () => {
    const email      = emailInput.value.trim();
    const licenseKey = licenseInput.value.trim();

    if (!email || !licenseKey) {
      updateStatus.textContent = getString("status-missing-credentials");
      updateStatus.style.color = "#dc3545";
      return;
    }

    updateStatus.textContent = getString("status-verifying");
    updateStatus.style.color = "#888";

    try {
      const updatedCount = await customStylesManager.checkAndInstallUpdates(
        doc, stylesContainer, statusDiv, licenseKey
      );

      if (updatedCount === 0) {
        updateStatus.textContent = getString("status-all-uptodate");
        updateStatus.style.color = "#28a745";
      } else {
        updateStatus.textContent = getString("status-updates-available", {
          args: { count: updatedCount },
        });
        updateStatus.style.color = "#fd7e14";
      }
    } catch (e) {
      updateStatus.textContent = getString("status-update-failed");
      updateStatus.style.color = "#dc3545";
    }
  });

  // ── Clear Credentials button ──────────────────────────────────────────────
  logoutBtn?.addEventListener("click", () => {
    licenseManager.clearCredentials();
    emailInput.value          = "";
    licenseInput.value        = "";
    stylesContainer.innerHTML = "";
    statusDiv.textContent     = getString("status-credentials-cleared");
    statusDiv.style.color     = "#888";
    hideUpdateRow();
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
