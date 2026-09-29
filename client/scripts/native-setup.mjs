#!/usr/bin/env node
/**
 * Patches the generated native projects (after `npx cap add ios|android`) with everything the app needs:
 * camera/gallery permissions, native sign-in (Google, Apple, Microsoft) URL schemes, entitlements and manifest entries.
 * Idempotent: safe to run after every `npx cap sync` (npm run cap:sync already does).
 *
 *   node scripts/native-setup.mjs              # production-safe
 *   node scripts/native-setup.mjs --allow-http # also allow http:// API calls on Android (local development only)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'src/environments/native-auth.json'), 'utf8'));
const APP_ID = 'il.roshshaket.app';
const allowHttp = process.argv.includes('--allow-http');
const changes = [];

const read = p => readFileSync(p, 'utf8');
function write(p, before, after, what) {
  if (before !== after) { writeFileSync(p, after); changes.push(what); }
}

// ------------------------------------------------------------------ iOS
function setupIos() {
  const appDir = join(root, 'ios/App/App');
  if (!existsSync(appDir)) return console.log('• iOS: no ios/ folder (run `npx cap add ios` first) – skipped');

  // Info.plist: permissions, URL schemes (MSAL + Google reversed client id), MSAL broker queries
  const plistPath = join(appDir, 'Info.plist');
  const plist0 = read(plistPath);
  let plist = plist0;
  const addKey = (key, xml) => {
    if (!plist.includes(`<key>${key}</key>`)) plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n${xml}\n</dict>\n</plist>\n`);
  };
  addKey('NSCameraUsageDescription', '\t<string>כדי לצלם את תלוש השכר</string>');
  addKey('NSPhotoLibraryUsageDescription', '\t<string>כדי לבחור תלוש שכר מהגלריה</string>');
  addKey('NSPhotoLibraryAddUsageDescription', '\t<string>כדי לשמור תמונה בגלריה, רק אם תבקשו</string>');

  const schemes = ['msauth.$(PRODUCT_BUNDLE_IDENTIFIER)'];
  if (cfg.googleIosClientId) schemes.push('com.googleusercontent.apps.' + cfg.googleIosClientId.replace(/\.apps\.googleusercontent\.com$/, ''));
  const missing = schemes.filter(s => !plist.includes(`<string>${s}</string>`));
  if (missing.length) {
    const entry = `\t\t<dict>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n${missing.map(s => `\t\t\t\t<string>${s}</string>`).join('\n')}\n\t\t\t</array>\n\t\t</dict>`;
    if (plist.includes('<key>CFBundleURLTypes</key>')) plist = plist.replace(/(<key>CFBundleURLTypes<\/key>\s*<array>)/, `$1\n${entry}`);
    else addKey('CFBundleURLTypes', `\t<array>\n${entry}\n\t</array>`);
  }
  addKey('LSApplicationQueriesSchemes', '\t<array>\n\t\t<string>msauthv2</string>\n\t\t<string>msauthv3</string>\n\t</array>');
  write(plistPath, plist0, plist, 'iOS Info.plist: permissions + URL schemes');

  // AppDelegate: let MSAL finish the Microsoft sign-in redirect
  const delegatePath = join(appDir, 'AppDelegate.swift');
  const d0 = read(delegatePath);
  let d = d0;
  if (!d.includes('import RecognizebvCapacitorPluginMsauth')) d = d.replace('import Capacitor', 'import Capacitor\nimport RecognizebvCapacitorPluginMsauth');
  if (!d.includes('MsAuthPlugin.checkAppOpen')) {
    d = d.replace(/(\n(\s*)return ApplicationDelegateProxy\.shared\.application\(app, open: url, options: options\))/,
      '\n$2if MsAuthPlugin.checkAppOpen(url: url, options: options) == true {\n$2    return true\n$2}$1');
  }
  write(delegatePath, d0, d, 'iOS AppDelegate: Microsoft redirect handling');

  // Sign in with Apple entitlement
  const entPath = join(appDir, 'App.entitlements');
  if (!existsSync(entPath)) {
    writeFileSync(entPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.developer.applesignin</key>
\t<array>
\t\t<string>Default</string>
\t</array>
</dict>
</plist>
`);
    changes.push('iOS App.entitlements: Sign in with Apple');
  }
  const pbxPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  if (existsSync(pbxPath)) {
    const p0 = read(pbxPath);
    // Add CODE_SIGN_ENTITLEMENTS to every build configuration of the App target (the blocks carrying our bundle id).
    const p = p0.replace(/buildSettings = \{([^}]*?PRODUCT_BUNDLE_IDENTIFIER = [^;]*;[^}]*)\}/g, (block, body) =>
      body.includes('CODE_SIGN_ENTITLEMENTS') ? block
        : `buildSettings = {\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;${body}}`);
    write(pbxPath, p0, p, 'iOS project: entitlements linked to the App target');
  }
}

// ------------------------------------------------------------------ Android
function setupAndroid() {
  const manifestPath = join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(manifestPath)) return console.log('• Android: no android/ folder (run `npx cap add android` first) – skipped');

  const m0 = read(manifestPath);
  let m = m0;
  // Camera plugin permissions (gallery on Android 13+, legacy storage on older versions)
  const perms = [
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />'
  ].filter(x => !m.includes(x.match(/name="([^"]+)"/)[1]));
  if (perms.length) m = m.replace(/(\n\s*<application)/, `\n    ${perms.join('\n    ')}\n$1`);

  // Microsoft: MSAL redirect activity (needs the signing key hash)
  if (cfg.microsoftAndroidKeyHash && !m.includes('com.microsoft.identity.client.BrowserTabActivity')) {
    m = m.replace(/(\n\s*<\/application>)/, `
        <activity android:name="com.microsoft.identity.client.BrowserTabActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="msauth" android:host="${APP_ID}" android:path="/${cfg.microsoftAndroidKeyHash}" />
            </intent-filter>
        </activity>$1`);
  } else if (!cfg.microsoftAndroidKeyHash) {
    console.log('• Android: microsoftAndroidKeyHash is empty – Microsoft sign-in stays hidden on Android');
  }

  if (allowHttp && !m.includes('usesCleartextTraffic')) m = m.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
  write(manifestPath, m0, m, 'Android manifest: permissions + sign-in' + (allowHttp ? ' + http for development' : ''));

  // MSAL's dependency feed
  const gradlePath = join(root, 'android/build.gradle');
  if (existsSync(gradlePath)) {
    const g0 = read(gradlePath);
    const feed = 'https://pkgs.dev.azure.com/MicrosoftDeviceSDK/DuoSDK-Public/_packaging/Duo-SDK-Feed/maven/v1';
    const g = g0.includes(feed) ? g0 : g0.replace(/(allprojects\s*\{\s*repositories\s*\{)/, `$1\n        maven { url '${feed}' }`);
    write(gradlePath, g0, g, 'Android build.gradle: MSAL repository');
  }
}

setupIos();
setupAndroid();
console.log(changes.length ? '✓ Updated:\n  - ' + changes.join('\n  - ') : '✓ Native projects already up to date');
if (!cfg.googleIosClientId) console.log('• googleIosClientId is empty – Google sign-in stays hidden on iOS');
