# Pocket Food Tracker — VS Code PWA

A mobile-first personal food diary. It stores data in the browser's IndexedDB database on the device, supports barcode lookup, package-label entry, portions, homemade recipes, South African food estimates, goals, weekly charts, CSV export, JSON backup/restore, and an offline app shell.

## 1. Open in VS Code

1. Extract this ZIP to a folder.
2. Open the folder in VS Code.
3. Install **Live Server** from the Extensions panel if you do not already have it.
4. Right-click `index.html` and choose **Open with Live Server**.
5. Test the app in your phone browser by deploying the folder to an HTTPS static host. Camera and PWA installation require HTTPS (localhost is an exception for local computer testing).

## 2. Put it on your phone

For a simple static deployment, you can use GitHub Pages:
1. Create a GitHub repository.
2. Upload the contents of this folder to the repository root (not the ZIP itself).
3. In the repository, open **Settings → Pages** and publish from the main branch/root.
4. Wait for GitHub Pages to provide the HTTPS URL.
5. Open that URL on your phone.
6. Android Chrome: menu → **Install app** or **Add to Home screen**. iPhone Safari: Share → **Add to Home Screen**.

Keep `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`, and `icon.svg` in the same folder.

## 3. Barcode scanning and nutrition data

- The app queries Open Food Facts' public API. Internet is required for a new lookup.
- Camera scanning loads `html5-qrcode` from a CDN, so the first camera use needs internet. If unavailable, type the barcode manually.
- Product records may be incomplete, out of date, or community-contributed. Always compare values with the product's package.
- Values are imported per 100 g when available. The amount eaten is scaled proportionally.
- Missing values remain blank/unknown and are displayed as `—`; they are not silently treated as zero.
- When the label says per serving, choose **Per serving** and set the basis amount to the serving's weight in grams. If the label only gives a portion size and you do not know its weight, weigh the portion first.
- The scanner does not weigh food. A kitchen scale and the correct cooked/raw basis are important for accuracy.
- South African foods in the built-in list are clearly marked **estimate** and should not be treated as verified product facts.

## 4. Offline use and privacy

- The app shell is cached by the service worker after the first successful visit over HTTPS.
- Foods already saved and diary logging work offline. New barcode lookups need internet; the camera scanner library also needs internet unless the library has already been loaded and cached by the browser.
- Data is local to this browser on this device. It does not sync to other devices and is not uploaded to a personal account.
- Browser storage may be cleared or evicted. Download a JSON backup regularly; CSV export is available for diary entries.
- Photos are resized and stored locally as compressed images. Storage quotas vary by browser/device.

## 5. Important limitations

No food tracker can guarantee 100% accuracy. Barcode matching, nutrition-label rounding, product reformulations, cooking methods, drained/cooked weights, and portion measurement all introduce uncertainty. Use label-checked values when possible. This app is a personal logging tool, not a medical device or medical advice.
