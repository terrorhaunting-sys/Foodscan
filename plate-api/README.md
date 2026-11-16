# Foodscan Plate Scanner API (Cloudflare Worker)

This is the secure backend for the AI-powered plate scanner. The OpenAI API key is stored as a Cloudflare Worker secret and is never sent to the browser.

## Deploy

1. Create/sign in to a Cloudflare account and install Node.js from https://nodejs.org/.
2. Open a terminal in this `plate-api` folder.
3. Install Wrangler: `npm install --save-dev wrangler`
4. Authenticate: `npx wrangler login`
5. Set the API key as a secret (do not paste it into `worker.js`, `app.js`, GitHub, or this README):
   `npx wrangler secret put OPENAI_API_KEY`
   Paste your OpenAI API key when prompted. API usage may incur charges; set usage limits in the provider account.
6. Review `wrangler.toml`. `ALLOWED_ORIGINS` must be your exact site origin, with no path and no trailing slash. For the provided GitHub Pages site this is `https://terrohaunting-sys.github.io`.
7. Deploy: `npx wrangler deploy`
8. Copy the deployed Worker URL, e.g. `https://foodscan-plate-api.YOUR-SUBDOMAIN.workers.dev/analyze`.

## Connect the frontend

In the root `app.js`, replace the placeholder value of `PLATE_API_URL` with your deployed `/analyze` URL. This URL is public by design; the API key is not. Commit/upload the updated frontend files to GitHub Pages.

## Test

Open the deployed Foodscan site over HTTPS, choose a meal photo, and press **Analyse plate photo**. If requests are rejected, check the browser developer console and Worker logs with `npx wrangler tail`.

## Security notes

- CORS restricts browser requests to `ALLOWED_ORIGINS`; it is not a substitute for rate limiting. If the site becomes public, add Cloudflare rate limiting/bot controls to avoid unexpected API usage.
- The Worker rejects unsupported image data URLs and oversized requests. Frontend compresses photos before upload.
- The Worker does not save or log submitted images intentionally, but the AI provider processes the image to provide a response. Do not send sensitive photos.
- AI identification, weights, calories, macros and micronutrients are estimates. Micronutrients are particularly uncertain from photos and may be returned as unavailable (null). Confirm ingredient identity, portions, preparation and nutrition before relying on them.
- GitHub Pages cannot keep API keys secret. Never put provider keys in client-side JavaScript or HTML.
