# Foodscan — ready-to-install project

This is the complete installable PWA frontend plus the secure AI plate-analysis backend source.

## What works immediately
- Local food diary, manual nutrition entry, goals/reports and offline app shell.
- Barcode/product lookups when online.
- Mobile camera/photo selection for plate scanning.
- Editing ingredient names, gram weights and nutrition estimates before confirming a meal.

## Important: AI plate recognition needs one-time backend setup
The AI plate scanner cannot run fully until you deploy `plate-api/` and provide your own AI API key. This is required to keep the secret out of public GitHub Pages code. Full steps are in `plate-api/README.md`. Once deployed, replace `PLATE_API_URL` near the top of `app.js` with your Worker URL ending in `/analyze`, then publish the frontend. AI use may incur provider charges.

## Install on your phone
1. Upload the contents of this folder (not the ZIP) to the root of your GitHub Pages repository. Keep the filenames exactly as supplied.
2. Wait for GitHub Pages to deploy and open the HTTPS website on your phone.
3. Android Chrome: menu → Install app / Add to Home screen. iPhone Safari: Share → Add to Home Screen.
4. Open it once online so the offline shell can be cached.

## Local testing
Open this folder in VS Code and use Live Server. Camera/PWA installation requires HTTPS or localhost.

## Existing site note
This package is a replacement frontend for the Foodscan site. Back up your current repository and export any important local diary data before replacing files. Browser-local diary data does not automatically transfer between browsers or devices.

## Safety and accuracy
Plate photo weights and nutrition are estimates, not measurements. Confirm food identity, grams, cooking method, sauces and oils before saving. Open Food Facts records can be incomplete; compare packaged-food values with labels.
