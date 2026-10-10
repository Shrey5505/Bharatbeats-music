# BharatBeats

A mobile-first music discovery PWA built with React, TypeScript and Vite. It searches Internet Archive records tagged as music and offers a track for playback only after the Archive's item metadata declares a recognized, playback-compatible license, lists a real supported audio file, and the listener reviews and confirms the source rights. The Archive license is an uploader's declaration, not independent legal verification; always review the linked item and attribution before reuse.

## Run it on a computer

1. Install [Node.js](https://nodejs.org/) (version 20 or newer).
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev` and open the local URL Vite prints.
5. Check the app with `npm test`, then create the production site with `npm run build`.

`npm run preview` serves the production build locally.

### From an Android phone

You do not need to install Node.js on your phone. If this project is open in a GitHub Codespace or a browser-based VS Code workspace, open its **Terminal** and run:

```sh
npm install
npm test
npm run build
```

To publish the changes from that workspace, run `git add .`, `git commit -m "Build BharatBeats music app"`, then `git push`. You can then complete the Pages steps below in GitHub using Chrome on your phone. A normal mobile browser or the GitHub app cannot run the Vite development server by itself.

## Publish free on GitHub Pages

1. Sign in to [GitHub](https://github.com/) and choose **New repository**. Name it exactly `bharatbeats-music`; for a public repository, choose **Public**, then **Create repository**.
2. Upload the project files (including `.github/workflows/deploy.yml`) to the repository's `main` branch. If using Git on a computer, run:

   ```sh
   git init
   git add .
   git commit -m "Build BharatBeats music app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/bharatbeats-music.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` with your GitHub username. If this folder is already a Git repository with a remote, use that remote instead of repeating `git init` or `git remote add`.

3. In the repository on GitHub, open **Settings → Pages**. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and wait for **Deploy BharatBeats to GitHub Pages** to finish. Your site will be at `https://YOUR-USERNAME.github.io/bharatbeats-music/`.

The Vite base path and PWA start/scope URLs are configured for `/bharatbeats-music/`. GitHub Pages publishes over HTTPS, which is required for service workers and installable PWAs.

## Install on Android

Open the published `https://YOUR-USERNAME.github.io/bharatbeats-music/` URL in Chrome. Use Chrome's **⋮ → Install app** (or **Add to Home screen**) and confirm. Playback in the background and Bluetooth media buttons depend on Android, browser, and device support. A website cannot provide full Android Auto integration; that needs a separate native Android media app built to Android Auto requirements.

For a Tata car, pair the phone over Bluetooth and choose it as the car's audio source. BharatBeats provides media metadata and supported headset/steering-wheel actions through the browser's Media Session API. Button behavior depends on the car's Bluetooth profile and Android/browser support.

## What is and is not streamed

- **Music:** Results and audio files come from the Internet Archive APIs and are filtered to items tagged as music. Playback is gated by an allowlist of public-domain and Creative Commons licenses that permit unmodified playback, a real supported file in the item metadata, and a required user review/confirmation before first play in each visit. The Archive records the uploader-provided license; the app cannot independently prove that an uploader owns the recording. Review rights and attribution on the source item.
- **Radio:** Vividh Bharati, FM Gold, FM Rainbow, and regional services open Akashvani's verified official live-radio page (`https://akashvani.gov.in/radio/live.php`). This app intentionally does not embed unverified stream URLs. Choose and listen on the broadcaster's page.
- **Podcasts:** Search uses Apple's public podcast directory API; series episodes are read from the publisher's RSS feed only when the feed allows browser access. Episodes are playable here only when the RSS feed explicitly declares a compatible open license. Otherwise use the publisher/Apple listing link.
- Commercial recordings without a verified free license are not played or catalogued as free streams. An empty music search offers Apple Music and Spotify search links; playback remains on those authorized services.

## Low-data and offline notes

Choose **Low Data**, **Balanced**, or **Best available** before playback; the app selects among formats actually listed in the Archive item metadata and does not preload a playlist. Low Data prefers lower-size / lower-bitrate candidates when metadata permits. Service-worker caching is limited to the app shell. Favorites, playlists, and recently played metadata are stored in IndexedDB; audio is never cached or downloaded by this app. For Tata car Bluetooth, connect the Android phone as a Bluetooth audio device; track metadata and headset/steering-wheel controls are exposed through Android's Media Session support when the car and browser support it. Source CORS, unavailable files, unsupported codecs, and offline APIs are surfaced rather than replaced with mock content.

## Tests

```sh
npm test
npm run build
```
