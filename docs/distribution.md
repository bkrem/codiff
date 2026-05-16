# Distribution

## Native Apps

Codiff uses Electron Forge at the repository root. The Forge setup mirrors Athena Crisis' maker and macOS signing/notarization shape, but uses Codiff-specific identifiers:

- App bundle ID: `dev.nkzw-tech.codiff`
- Product name: `Codiff`
- URL scheme: `codiff`

Build commands:

```sh
pnpm make
pnpm make:ci
pnpm make:mac
```

`pnpm make:mac` builds the renderer and then runs the Apple Silicon build:

```sh
electron-forge make --platform=darwin --arch=arm64
```

For a signed and notarized macOS build, export the same Apple environment variables used by Athena Crisis before running `pnpm make:mac`:

```sh
export APPLE_ID='apple-id@example.com'
export APPLE_PASSWORD='app-specific-password-or-keychain-profile'
export APPLE_TEAM_ID='TEAMID12345'
export APPLE_SIGNING_IDENTITY='Developer ID Application: Nakazawa Tech (TEAMID12345)'
pnpm make:mac
```

The signing certificate must already be present in the local keychain. If `APPLE_SIGNING_IDENTITY` is omitted, Electron's signing tooling may choose a matching Developer ID identity automatically, but setting it explicitly is less ambiguous.

## GitHub Actions

`.github/workflows/build-app.yml` builds Linux and Windows artifacts on Ubuntu with Wine, matching Athena Crisis' Linux/Windows CI approach.

The workflow collects Linux artifacts before the Windows build can replace the
Forge `out` directory, then uploads:

- `artifacts/native-apps/linux-make`
- `artifacts/native-apps/codiff-linux-x64.tar.gz`
- `artifacts/native-apps/windows-make`

macOS builds are intentionally local-only for now because they require the Developer ID certificate in the local keychain.

## App-Specific Setup

The Nakazawa Tech Apple account, team, and Developer ID certificate are reusable.

These parts are app-specific:

- `dev.nkzw-tech.codiff` must be the bundle ID you want to use for Codiff.
- Codiff should eventually get its own `electron/icons/icon.icns`, `electron/icons/icon.ico`, and `electron/icons/icon.png`. The Forge config uses these automatically if present.
- Release asset hosting URLs are app-specific. For Homebrew, the macOS zip needs a stable HTTPS URL.

## Homebrew Tap

Use a cask, not a formula, because Codiff is a prebuilt macOS `.app` bundle.

Create a tap repository:

```sh
gh repo create cpojer/homebrew-tap --public --clone
cd homebrew-tap
mkdir -p Casks
```

After building the mac app, upload `out/make/zip/darwin/arm64/codiff-darwin-arm64-*.zip` to a stable release URL, for example a GitHub Release in the Codiff repository. Compute its checksum:

```sh
shasum -a 256 codiff-darwin-arm64-0.0.1.zip
```

Create `Casks/codiff.rb`:

```ruby
cask "codiff" do
  version "0.0.1"
  sha256 "REPLACE_WITH_SHA256"

  url "https://github.com/cpojer/codiff/releases/download/v#{version}/codiff-darwin-arm64-#{version}.zip"
  name "Codiff"
  desc "Local code review diff viewer"
  homepage "https://github.com/cpojer/codiff"
  depends_on arch: :arm64

  app "Codiff.app"
  binary "#{appdir}/Codiff.app/Contents/MacOS/Codiff", target: "codiff"
end
```

Commit and push:

```sh
git add Casks/codiff.rb
git commit -m "Add Codiff cask"
git push
```

Users can install it with either command:

```sh
brew install --cask cpojer/tap/codiff
brew tap cpojer/tap
brew install --cask codiff
```

The cask symlinks the packaged Electron executable as `codiff`. Running `codiff`
from a repository opens that folder, and running `codiff /path/to/repo` opens
the provided folder.

For updates, upload a new zip, update `version` and `sha256`, commit, and push.
