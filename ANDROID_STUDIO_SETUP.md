# 📱 Android Studio Setup & Running on Android

**Status**: Ready to build for Android  
**Prerequisites**: Android Studio installed + SDK configured

---

## ✅ Step-by-Step Setup

### Step 1: Build Production App

```bash
cd client

# Clean build
npm run build:prod

# Expected output:
# ✔ Successfully created bundle
# ✔ Output in www/ directory
```

This creates optimized code for Android.

---

### Step 2: Sync with Capacitor

```bash
# Sync web app to Android native
npx cap sync android

# Expected output:
# ✔ [capacitor] Copying web assets...
# ✔ [capacitor] Creating capacitor.config.json in native project
# ✔ [capacitor] sync complete
```

**What this does:**
- Copies built web app to Android project
- Configures native settings
- Updates Android dependencies

---

### Step 3: Open in Android Studio

```bash
# Automatically opens Android Studio
npx cap open android
```

**Or manually:**
1. Open Android Studio
2. File → Open
3. Navigate to: `client/android/`
4. Select the `android` folder
5. Click OK

**Android Studio loads the project** ✅

---

## 🔧 Android Studio Configuration

### Wait for Gradle Sync

When you first open the project, Android Studio syncs Gradle:

```
Gradle Sync Running...
  Building...
  Indexing...
  [████████░░] 80%
  
Done! ✅
```

This can take 2-5 minutes first time.

### Check SDK Manager

**Tools → SDK Manager**

Ensure installed:
- ✅ Android SDK Platform 30+ (recommended: 33-34)
- ✅ Android SDK Build Tools 34.x
- ✅ Android Emulator
- ✅ Android SDK Platform-Tools

If missing, click **Install** and wait.

---

## 📱 Set Up Android Emulator

### Create Virtual Device

1. **Click Device Manager** (left sidebar)

2. **Click "Create Device"**

3. **Select Phone**
   - Pixel 5 (recommended)
   - Pixel 4
   - Pixel 6 Pro

4. **Select System Image**
   - Android 13 (API 33)
   - Android 14 (API 34) ← Latest

5. **Configure Settings**
   - Name: `Pixel_5_Android_34` (or similar)
   - RAM: 2GB or more
   - Internal Storage: 2GB+
   - Enable external storage

6. **Click Finish**

Device is created ✅

### Launch Emulator

1. Click the device in Device Manager
2. Click Play (▶) button
3. Emulator boots (takes 1-2 minutes first time)
4. Shows Android home screen

**Emulator is ready!** ✅

---

## 🚀 Run App on Android

### Select Device

In Android Studio top menu bar:

```
Device Dropdown: [Pixel_5_Android_34] ▼
```

Select your emulator.

### Build & Run

**Option A: Click Play Button (▶)**

- Green ▶ button in top toolbar
- Builds app
- Deploys to emulator
- Launches app

**Option B: Use Menu**

- Run → Run 'app'
- Or press: Shift+F10

### What Happens

```
Building...
  ✔ Gradle build successful
  ✔ APK created
  ✔ Installing on device
  ✔ Starting activity

Emulator shows:
  [Loading screen]
  [Ionic splash screen]
  [App interface]
```

### App Launches! 🎉

You should see:
- ✅ Ionic loading screen
- ✅ App initialization
- ✅ Navigation menu
- ✅ Home/welcome page

---

## 🔍 Debugging in Android Studio

### View Console Logs

**Android Studio → Logcat** (bottom panel)

Shows:
- App startup logs
- Errors (red)
- Warnings (yellow)
- Info (blue)

Filter to your app:
```
Package Name: io.ionic.starter  (in dropdown)
```

### Example Logcat Output

```
I/RoshShaket: App initializing...
I/RoshShaket: Loading API config
D/RoshShaket: API Base URL: http://10.0.2.2:5080
I/RoshShaket: App ready!
D/RoshShaket: User tapped button
```

### Set Breakpoints

Debug code by:
1. Click line number in code
2. Red dot appears (breakpoint)
3. Run in debug mode (bug icon)
4. Execution pauses at breakpoint
5. Step through code

---

## 📡 Configure API Connection

### Android Emulator Network

From emulator, localhost = **10.0.2.2**

Edit `capacitor.config.ts`:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'rosh-shaket',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    // FOR DEVELOPMENT ON EMULATOR:
    url: 'http://10.0.2.2:8100'  // This is your dev server
  }
};

export default config;
```

After editing:
```bash
npm run build:prod
npx cap sync android
# Run app again in Android Studio
```

### For Physical Device

Find your machine IP:
```bash
# Windows
ipconfig  # IPv4 Address

# macOS/Linux
ifconfig  # inet
```

Edit `capacitor.config.ts`:
```typescript
server: {
  url: 'http://192.168.1.100:8100'  // Your actual IP
}
```

---

## 🔄 Development Workflow

### Hot Development (Web → Android)

For fastest development:

```bash
# Terminal 1: Start web dev server
npm start
# Runs on http://localhost:8100

# Terminal 2: Monitor file changes
# (leave running)

# Browser: Open http://localhost:8100
# Test changes in browser

# When satisfied:
# Terminal 3: Build for Android
npm run build:prod
npx cap sync android

# Android Studio: Run app on emulator
```

### Quick Deploy Cycle

```
1. Edit TypeScript file
2. Save
3. npm start auto-reloads in browser
4. Test in browser
5. When working:
   npm run build:prod
   npx cap sync android
6. Click Run in Android Studio
7. Test on emulator
```

---

## 📊 Testing on Android

### Test Checklist

- [ ] App launches without crashing
- [ ] Menu navigation works
- [ ] Page transitions smooth
- [ ] API data loads
- [ ] Forms accept input
- [ ] Buttons trigger actions
- [ ] Scrolling works
- [ ] Touch gestures respond
- [ ] Orientation changes handled
- [ ] No console errors

### Performance Testing

**Android Studio → Profiler**

1. Click Profiler (left side)
2. Select app from dropdown
3. Monitor:
   - CPU usage
   - Memory consumption
   - Network activity
   - Battery drain

### Network Inspection

**Android Studio → Network Inspector**

See:
- API requests
- Response times
- Data sizes
- Errors

---

## 🐛 Common Issues & Fixes

### App Crashes on Launch

**Check Logcat for errors:**
```
Android Studio → Logcat
Look for red ERROR messages
```

**Common causes:**
1. API connection failed
   - Edit `capacitor.config.ts`
   - Use correct server URL

2. Missing permissions
   - Check `AndroidManifest.xml`
   - Add required permissions

3. Native module issue
   - Run: `npm run build:prod`
   - Run: `npx cap sync android`

### Blank White Screen

**Possible solutions:**
```bash
# Full rebuild
npm run build:prod
npx cap sync android

# Clean Gradle cache
Android Studio → Build → Clean Project
Android Studio → Build → Rebuild Project
```

### Slow or Laggy

**Check performance:**
1. Android Studio → Profiler
2. Monitor CPU/Memory
3. Check Logcat for warnings
4. Reduce animation if needed

### Can't Find Device

**Check connections:**
```bash
# Physical device:
adb devices

# Should list connected devices
```

**Or use emulator:**
- Device Manager → Create Virtual Device
- Launch emulator
- Run app

---

## 🔐 Permissions

### Common Permissions

In `android/app/src/AndroidManifest.xml`:

```xml
<!-- Camera -->
<uses-permission android:name="android.permission.CAMERA" />

<!-- File storage -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

<!-- Network -->
<uses-permission android:name="android.permission.INTERNET" />
```

### Request at Runtime

For Android 6+, request permissions at runtime:

```typescript
// In your app code
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType } from '@capacitor/camera';

// Request camera
const result = await Camera.requestPermissions();
```

---

## 📦 Building Release APK

### Create Signed APK

For Google Play Store:

1. **Generate Key:**
   ```bash
   keytool -genkey -v -keystore my-release-key.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias my-key-alias
   ```

2. **Edit build.gradle:**
   ```gradle
   signingConfigs {
     release {
       keyStore file("../my-release-key.jks")
       keyAlias "my-key-alias"
     }
   }
   ```

3. **Build Release APK:**
   ```bash
   Android Studio → Build → Build Bundle(s)/APK(s) → Build APK(s)
   ```

4. **Find APK:**
   ```
   android/app/release/app-release.apk
   ```

---

## 🌐 Network Debugging

### Enable WebView Debugging

```bash
# Android Studio
Tools → Device Manager
Open web inspector for app WebView
```

See what your web app is doing inside Android.

### Monitor Network Traffic

**Android Studio → Network Inspector:**
- Watch API calls
- See response times
- Debug failures

---

## 📝 Development Environment

### Versions

Check installed versions:

```bash
# Android SDK
Android Studio → About → System Info

# Node/npm
node --version
npm --version

# Capacitor
npx cap --version

# Gradle
Android Studio shows Gradle version
```

### Update if Needed

```bash
# Update npm packages
npm update

# Update Gradle (via Android Studio)
Android Studio → Tools → SDK Manager
```

---

## 🎯 Android-Specific Features

### Use Native APIs

Capacitor gives access to:
- Camera
- Storage
- Location
- Contacts
- Notifications
- Geolocation

Example:
```typescript
import { Camera } from '@capacitor/camera';

const photo = await Camera.getPhoto({
  resultType: CameraResultType.Uri,
  source: CameraSource.Camera
});
```

### App Settings

Edit `capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'RoshShaket',
  webDir: 'www',
  
  // Android specific
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  }
};
```

---

## 📱 Device-Specific Testing

### Test on Multiple Devices

Create multiple virtual devices:
- Pixel 5 (6")
- Pixel Tablet (10")
- Pixel 2 (5")
- Custom resolution

Test on each to ensure:
- Responsive design
- Touch interactions
- Performance

### Physical Device Testing

Benefits:
- Real performance metrics
- Actual network conditions
- Battery drain testing
- Real user experience

Steps:
1. Enable USB Debugging on phone
2. Connect USB cable
3. Select device in Android Studio
4. Click Run

---

## 🚀 Advanced Topics

### ProGuard/R8 Obfuscation

For release builds:

**android/app/build.gradle:**
```gradle
android {
  buildTypes {
    release {
      minifyEnabled true
      shrinkResources true
      proguardFiles 'proguard-rules.pro'
    }
  }
}
```

### Firebase Integration

Add Analytics:
```bash
npm install @capacitor-firebase/analytics
npx cap sync android
```

Configure in Firebase console.

### Custom Native Code

If you need native Android features:

1. Create Android module in `android/app/src`
2. Use Capacitor Plugin API
3. Call from JavaScript

---

## 💡 Tips & Tricks

1. **Use Emulator for Development**
   - Faster iteration
   - No USB cable needed
   - Multiple device sizes

2. **Physical Device for Testing**
   - Real performance
   - Real user experience
   - Battery drain testing

3. **Hot Reload**
   - Edit web code
   - Refresh emulator (Cmd+R or F5)
   - See changes instantly

4. **Debug in Chrome**
   - Open `chrome://inspect`
   - Select WebView
   - DevTools opens
   - Debug like web!

5. **Check Permissions**
   - Some features need permissions
   - Request at runtime
   - Handle denials gracefully

---

## 📚 Resources

### Official Docs
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android Studio Guide](https://developer.android.com/studio)
- [Android Developers](https://developer.android.com)

### Ionic Resources
- [Ionic Documentation](https://ionicframework.com/docs)
- [Ionic Community](https://community.ionicframework.com)

---

## 🆘 Troubleshooting Checklist

| Issue | Check | Solution |
|-------|-------|----------|
| App crashes | Logcat | Check error message, fix code |
| Blank screen | Network | Fix API URL in config |
| Slow | Profiler | Optimize code, reduce animations |
| Won't build | Gradle | Run: `Build → Clean Project` |
| Device missing | adb | Connect USB, enable debug |
| Permission denied | Manifest | Add permission, request at runtime |

---

## ✅ Quick Reference

### Commands

```bash
# Build for Android
npm run build:prod
npx cap sync android

# Open in Android Studio
npx cap open android

# Run app
Android Studio → Click Play (▶)

# View logs
Logcat (bottom panel)

# Debug
Chrome → chrome://inspect
```

### Folders

```
client/
  ├── android/          # Android native project
  ├── www/              # Built web app
  ├── src/              # Source code
  └── capacitor.config.ts  # Android config
```

### Configuration

```
capacitor.config.ts    # Server URL, app settings
android/app/src/AndroidManifest.xml  # Permissions
android/app/build.gradle  # Gradle settings
```

---

## 🎉 You're Ready!

**Next Steps:**

1. ✅ Run: `npm run build:prod`
2. ✅ Run: `npx cap sync android`
3. ✅ Run: `npx cap open android`
4. ✅ Create virtual device (if needed)
5. ✅ Click Play (▶) to run

**Enjoy building on Android!** 🚀

---

Generated: 2026-09-28  
Status: Ready for Android development  
Questions?: See RUN_IN_BROWSER_AND_MOBILE.md
