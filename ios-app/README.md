# GG for iOS

There are two ways to get GG on an iPhone or iPad.

## 1. Home Screen app (no App Store, works today)

The website is an installable web app. On an iPhone or iPad:

1. Open https://gg-ai-studio.netlify.app in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.

GG then opens full screen from its own icon, without the Safari address bar.
It always loads the latest version of the site, and an offline screen appears
when there is no connection.

## 2. Native App Store app (Capacitor)

This folder is a [Capacitor](https://capacitorjs.com) project that wraps the
live site in a native iOS app. Every website deploy updates the app
automatically, with no new App Store release needed.

Requirements: a Mac with Xcode 16+, Node.js 20+, CocoaPods, and an Apple
Developer account if you want to publish.

```bash
cd ios-app
npm install
npm run setup   # creates the ios/ Xcode project, app icons and splash screen
npm run open    # opens the project in Xcode
```

In Xcode:

1. Select the **App** target, then **Signing & Capabilities**, and choose your team.
2. If needed, change the Bundle Identifier (default `app.netlify.ggaistudio`).
3. Pick a simulator or a connected iPhone and press **Run**.
4. To publish: **Product → Archive → Distribute App → App Store Connect**.

The app icon source is `assets/icon-only.png` (1024×1024) and the splash screen is `assets/splash.png` (2732×2732). Replace them and run
`npm run assets` to regenerate the icons.

## Native features (version 1.1)

The website detects when it runs inside the app (`ios-native.js` on the site)
and turns on these native features through Capacitor plugins:

- **Haptics**: a light tap when sending a message or pressing main buttons.
- **Share sheet**: a Share button on every GG answer (Messages, Mail, Notes…).
- **In-app browser**: external links open in a Safari sheet, so users stay in GG.
- **Network awareness**: an offline banner, plus a native "You're offline"
  screen with a retry button if GG can't load at launch (`www/error.html`).
- **Status bar and splash screen** that follow light and dark mode.
- **Deep links**: `gg://chat?prompt=Hello` opens GG with the prompt filled in.
  To enable the `gg://` scheme, in Xcode open **App → Info → URL Types**, add
  one with identifier `app.netlify.ggaistudio` and URL scheme `gg`.

The plugins are installed by `npm install` and linked by `npm run setup`
(or `npm run sync` after updating).

## Download

The project is also published on the website at
https://gg-ai-studio.netlify.app/app, as `downloads/gg-ios-app.zip`. After changing
this folder, rebuild the zip from the repository root with:

```bash
rm -f downloads/gg-ios-app.zip && zip -r downloads/gg-ios-app.zip ios-app -x 'ios-app/node_modules/*' 'ios-app/ios/*'
```

> App Store review note: Apple can reject apps that are only a website in a
> wrapper (guideline 4.2). GG's chat, tools and community features usually
> help, and version 1.1 adds native sharing, haptics, offline handling and
> deep links. Push notifications would strengthen the submission further.
> Use https://gg-ai-studio.netlify.app/privacy.html as the privacy policy URL
> and https://gg-ai-studio.netlify.app/app as the marketing/support URL.
