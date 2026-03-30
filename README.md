# Citation Styler Client Sync — Zotero Plugin

A Zotero plugin that allows you to install and manage your purchased custom citation styles directly within Zotero.

Please download the latest version of the plugin here:
[https://github.com/POBrien333/citationstyler-client-sync/releases](https://github.com/POBrien333/citationstyler-client-sync/releases)

![Citation Styler Client Sync - install, update, reinstall](./assets/screenshots/Citation%20Styler%20Client%20Sync%20-%20install,%20update,%20reinstall.png)

## Requirements

- Zotero 7 or later
- A valid license key (purchased at [citationstyler.com](https://citationstyler.com))
- A Zotero account (zotero.org)

## Installation

1. Download the latest `.xpi` file from the [releases page](https://github.com/POBrien333/citationstyler-client-sync/releases)
2. In Zotero, go to **Tools → Plugins**
3. Click the gear icon and select **Install Plugin From File…**
4. Select the downloaded `.xpi` file
5. Restart Zotero when prompted

## First Use

After installation, Zotero will automatically open the **Citation Styler Client Sync** settings pane. (If not, go to Edit > Settings)

1. Enter the **email address** you used to purchase your license
2. Enter your **license key**
3. Click **Verify License**
4. Your purchased styles will appear — click **Install** next to each one

## Updating Styles

When updated versions of your styles are available:

1. Open Zotero **Settings → Citation Styler Client Sync**
2. Click **Check for Updates**
3. Any styles with updates will show an **Update available** badge
4. Click **Update** next to each style to install the latest version

More detailled instructions with screenshots can be seen on my website: [Citation Styler Client Sync – Setup & Use](https://citationstyler.com/en/client-sync-einrichtung/)

## Troubleshooting

**"Please log in to your Zotero account"**
→ Open Zotero, go to **Edit → Preferences → Sync** and sign in to your zotero.org account first.

**"Email does not match this license key"**
→ Make sure you are using the same email address you used when purchasing.

**"Activation limit reached"**
→ You have reached the maximum number of devices for this license. Please contact support to deactivate an old device.

## Support

For license issues or support, please contact: info@citationstyler.com

---

## Changelog

### v1.0.2

- Dark mode support: all UI elements now adapt to Zotero's light/dark theme
- Sidebar icon switches to a white variant in dark mode
- Preferences pane heading updated to "Citation Styler Client Sync" with version number displayed
- Added "Copy Logs" button alongside the license buttons — click it to copy diagnostic information to your clipboard when contacting support

### v1.0.1

- Plugin rebranded to "Citation Styler" / "Citation Styler Client Sync"
- Improved "no styles available" error message to direct users to support
- Various stability and build improvements

### v1.0.0

- Initial release
- License validation via email and license key
- Browse, install, and update purchased citation styles within Zotero
- Offline support via cache and grace period
- Auto-opens settings on first install
