# Releasing CogNotez v5

v5 ships like v4: Linux AppImage, Windows NSIS installer and macOS dmg (+ zip, which the updater needs), built by GitHub Actions and published to GitHub Releases (`nawka12/CogNotez`). Installed apps update themselves with electron-updater (the user chooses when to download).

## Cut a release
1. Set `version` in `desktop-v5/package.json` (and the lockfile) and commit, e.g. `5.0.0-alpha.2` or `5.0.0`.
2. Tag it with a `v` in front and push the tag: `git tag v5.0.0-alpha.2 && git push origin v5.0.0-alpha.2`.
3. `.github/workflows/release-v5.yml` runs on any `v5.*` tag:
   - checks that the tag matches `package.json` (it fails early if not);
   - creates a **draft** release;
   - builds on Ubuntu, Windows and macOS and uploads the installers plus `latest*.yml` into the draft;
   - once all three succeeded, publishes it. A version with a `-` suffix (`-alpha.N`, `-beta.N`, `-rc.N`) is published as a **prerelease** and is never marked "latest"; a plain version is published as a normal release and becomes "latest".

If one platform fails, re-run only the failed job; the draft stays hidden until all three have uploaded. If the release was already published, electron-builder refuses to add to it, so delete the release (keep the tag) and re-run the workflow.

v4 tags (`v4.x.y`, anything not starting `v5.`) still run `release.yml` and build `desktop/`.

Local build, nothing published: `cd desktop-v5 && npm run dist -- --publish never` (output in `dist/`).

## Which users get which release (read before publishing)
The updater asks GitHub for the latest release and compares versions:
- A v4 app (4.0.3, `allowPrerelease` off) follows GitHub's "latest release" link, which skips prereleases and drafts. **v5 alphas, betas and rcs published as prereleases are invisible to v4 users.**
- An app whose own version has a prerelease part (5.0.0-alpha.1) turns `allowPrerelease` on automatically. It follows the newest alpha/beta/rc and also sees stable releases.
- A stable v5 app (5.0.0) only sees stable releases.
- Side effect: if a v4 hotfix is published while v5 prereleases are active, alpha users see that v4 release first in GitHub's feed, so they won't be offered a newer alpha until the next one. Avoid publishing v4 releases in that window.

> **Warning: publishing a v5 release that is not a prerelease (e.g. `v5.0.0`) updates every v4 desktop user to v5.** v5 uses Sync v2 and the Android app still speaks the old sync format, so after that update their desktop to Android sync stops until Android is ported to Sync v2. Do not publish a stable v5 before the Android port ships (or you have decided to cut over).

Builds that cannot replace themselves show "can't update itself" in Settings, About: unpacked or dev runs, Linux outside an AppImage, and macOS builds that are not signed with a Developer ID (Squirrel.Mac refuses unsigned updates). Users on those download new versions by hand.

## Google OAuth client (Drive sync sign-in)
Sync to Google Drive needs an OAuth client owned by the app, so users just click "Connect Google account". Without one baked in, Settings offers "Import Google OAuth client file" (a v4 `credentials.json` works).

1. In the [Google Cloud console](https://console.cloud.google.com/) create a project (e.g. "CogNotez") and enable the **Google Drive API**.
2. Google Auth Platform (OAuth consent screen): user type **External**, app name, support email, and, when asked, a home page and privacy policy link. Add the scopes `https://www.googleapis.com/auth/drive.file`, `openid` and `email`.
3. Credentials, Create credentials, OAuth client ID, application type **Desktop app**. Sign-in uses a loopback redirect (`http://127.0.0.1:<random port>`) with PKCE, which Desktop clients allow without registering a port.
4. Set the publishing status to **In production**. While it says "Testing", only listed test users can sign in and their refresh tokens expire after 7 days, so sync would keep asking to reconnect.

What Google requires: `drive.file` (access only to files the app itself creates), `openid` and `email` are all non-sensitive scopes, so no sensitive-scope or restricted-scope review (and no security assessment) should apply. Branding verification (the app name, logo and authorized domain you put on the consent screen) may still be asked for before the "unverified app" warning disappears. This is from memory of Google's current policy: **confirm the exact requirements on the consent screen in the console before the first public release**, because they change.

The client secret of a Desktop-app client is not confidential (it ends up in every installed copy), but keep it out of the repo anyway.

### Where the client id and secret go
- **GitHub Actions:** repository secrets `MAIN_VITE_GOOGLE_CLIENT_ID` and `MAIN_VITE_GOOGLE_CLIENT_SECRET`. The workflow passes them to the build, and electron-vite bakes them into the main bundle (`src/main/env.d.ts`, read in `src/main/index.ts`).
- **Local build:** a git-ignored `desktop-v5/.env` with
  ```
  MAIN_VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
  MAIN_VITE_GOOGLE_CLIENT_SECRET=...
  ```
  then `npm run build` or `npm run dist`.
- A client imported in Settings takes priority over the baked-in one.

## Code signing (optional)
Unsigned builds work (like v4: SmartScreen and Gatekeeper warn on first run). Signing turns on only when these repository secrets exist; nothing is signed or notarized without them, and no secret is stored in the repo.

| Secret | Used for |
|---|---|
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows code signing: a base64-encoded `.pfx`/`.p12` (or an https URL to it) and its password. |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | macOS "Developer ID Application" certificate (`.p12`, base64) and its password. |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization. Set all three, and only together with the macOS certificate. |

The workflow maps the Windows pair to electron-builder's `CSC_LINK` / `CSC_KEY_PASSWORD` on the Windows runner and the macOS pair on the macOS runner, so one platform's certificate is never offered to the other. A signed macOS app also turns on in-app updates there, because the app checks its own signature at runtime.
The macOS build is universal (Intel and Apple Silicon in one app).

## Needs the user
- Create the Google OAuth client and add the two `MAIN_VITE_GOOGLE_*` secrets (without them the build still works; users import a client file instead).
- Optionally add the signing secrets.
- Make sure repository Settings, Actions, Workflow permissions allow the workflow's `contents: write` (it is requested in the workflow itself, but an organization policy can cap it).
- Decide when to publish the first non-prerelease v5 (see the warning above).
