# Running RoshShaket in Browser & Android Studio

**Status**: ✅ Development server running on `http://localhost:5051`

---

## 🌐 Running in Browser (Web)

### ✅ Server is Running!

**Access the app:**
- **Local**: http://localhost:5051
- **Network**: Find your machine IP and use: http://YOUR_IP:5051

### What's Running

```
✔ Angular Dev Server: http://localhost:5051
✔ API Backend: http://localhost:5080
✔ Hot Reload: Enabled (changes refresh automatically)
✔ Watch Mode: Active
```

### Features in Browser

- ✅ Full app functionality
- ✅ Browser DevTools available (F12)
- ✅ Live reload on file changes
- ✅ Console logging
- ✅ Network inspection
- ✅ Debug mode

### Browser Console Access

Open browser DevTools:
```
Windows/Linux: F12 or Ctrl+Shift+I
macOS: Cmd+Option+I
```

### Common Browser Debugging

1. **Check Console for Errors**
   - Open DevTools → Console tab
   - Look for red errors or warnings

2. **Network Inspection**
   - DevTools → Network tab
   - Monitor API calls to http://localhost:5080

3. **Performance**
   - DevTools → Performance tab
   - Record and analyze app performance

4. **Storage**
   - DevTools → Application tab
   - Check localStorage, sessionStorage, cookies

---

## 📱 Running in Android Studio

### Prerequisites

1. **Android Studio**
   - Download: https://developer.android.com/studio
   - Install latest version

2. **Android SDK**
   - API Level: 28+ (recommended 30+)
   - Check in: Tools → SDK Manager

3. **Capacitor (Already Installed)**
   - Ionic's native bridge
   - Converts web app to native

4. **Node.js & npm**
   - Required: 20.x ✅ (already installed)

### Step 1: Build for Android

```bash
cd client

# Install dependencies (if not done)
npm install

# Generate production build
npm run build:prod

# Sync with Capacitor
npx cap sync android
```

**Expected output:**
```
✔ sync android complete
  Generated platform code and resources in android/
```

### Step 2: Open in Android Studio

```bash
# Open Android Studio with the Android project
npx cap open android
```

**Or manually:**
1. Open Android Studio
2. File → Open
3. Navigate to: `rosh-shaket/client/android`
4. Click Open

### Step 3: Configure Android Emulator

#### Option A: Use Android Virtual Device (AVD)

1. In Android Studio: **Device Manager** (left sidebar)
2. Click **Create Device**
3. Select: Pixel 5 (or similar)
4. Select API Level: 30+ (recommended)
5. Name it and create
6. Click Play (▶) to launch emulator

#### Option B: Use Physical Android Device

1. Enable Developer Mode:
   - Settings → About → Build Number (tap 7 times)
   - Go back → Developer Options → USB Debugging (enable)

2. Connect USB cable to computer
3. Device appears in Android Studio device list

### Step 4: Run App in Android Studio

1. **Select Device/Emulator**
   - Top menu: Select your device

2. **Build Project**
   - Build → Make Project (or Ctrl+F9)

3. **Run App**
   - Run → Run 'app' (or Shift+F10)
   - Or click green Play button (▶)

**App will:**
- ✅ Build and compile
- ✅ Deploy to emulator/device
- ✅ Launch automatically
- ✅ Show loading screen
- ✅ Display app interface

### Step 5: Debug in Android Studio

#### Logcat (Android Console)

View app logs:
```
Android Studio → View → Tool Windows → Logcat
```

Filter for app logs:
```
rosh-shaket  # Shows only app messages
```

#### Inspect Element (DevTools for Mobile)

```bash
# While app is running in emulator:
cd client
npm run cap:sync  # Update if files changed
npx cap open android  # Refresh in Studio
```

---

## 🔄 Development Workflow

### Make Changes While Running

#### In Browser:
```bash
# Terminal 1: Dev server (already running)
cd client
npm start

# Terminal 2: Edit files
# Changes auto-refresh in browser
```

#### In Android Studio:
```bash
# Changes don't auto-sync
# You need to rebuild:

# Terminal: Rebuild after changes
npm run build:prod
npx cap sync android

# Android Studio: 
# Run → Run 'app' again
```

### Live Reload for Android (Advanced)

To enable live reload on Android:

1. Update `capacitor.config.ts`:
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'rosh-shaket',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    url: 'http://YOUR_MACHINE_IP:5051'  // For live reload
  }
};

export default config;
```

2. Rebuild and sync:
```bash
npm run build:prod
npx cap sync android
```

---

## 🎨 Responsive Design Testing

### Browser Testing

Test different screen sizes:

**DevTools → Device Toolbar** (Ctrl+Shift+M)

Presets:
- Mobile S: 320px
- Mobile M: 375px
- Mobile L: 425px
- Tablet: 768px
- Laptop: 1024px+

### Android Emulator Sizes

Available virtual devices:
- **Pixel 5**: 1080x2340 (6" phone)
- **Pixel 4**: 1080x2280 (5.7" phone)
- **Pixel Tablet**: 2560x1600 (10" tablet)

---

## 🚀 Performance Testing

### In Browser

**DevTools → Lighthouse**

1. Click "Analyze page load"
2. Get scores for:
   - Performance
   - Accessibility
   - Best Practices
   - SEO

### In Android

**DevTools → Performance Profiler**

1. Android Studio → Profiler (left side)
2. Select app → Select "All Processes"
3. Monitor:
   - CPU usage
   - Memory
   - Network
   - Battery

---

## 🔗 API Connection

### Development (Browser)

App connects to: `http://localhost:5080`

Verify connection:
1. Open DevTools → Network
2. Make API call (interact with app)
3. See requests to `http://localhost:5080`

### Production (Android)

For testing against production API:

Edit `src/environments/environment.prod.ts`:
```typescript
export const environment = {
  apiBaseUrl: 'https://your-production-api.com'
};
```

Then rebuild:
```bash
npm run build:prod
```

---

## 📋 Troubleshooting

### Browser Issues

#### App not loading?
```bash
# Clear cache and restart
npm start

# Or hard refresh in browser: Ctrl+Shift+R
```

#### API calls failing?
```bash
# Check if API is running
docker-compose ps

# Or start services
docker-compose up -d
```

#### Port 5051 already in use?
```bash
# Use different port
ng serve --port 8101
```

### Android Issues

#### Emulator won't start?
```bash
# Check if AVD is created
# Device Manager → Create new AVD

# Or check system resources
# Needs: 2GB+ RAM, 4GB disk space
```

#### App crashes on Android?
```bash
# Check logs
Android Studio → Logcat

# Rebuild fresh
npm run build:prod
npx cap sync android
npm run cap:open android
```

#### Can't find device?
```bash
# Check USB connection
# Settings → Apps → Permissions → Allow USB

# Or use emulator
# Device Manager → Create virtual device
```

#### API calls failing on Android?
```bash
# Update capacitor.config.ts with correct server

# For localhost from emulator:
// Android emulator localhost = 10.0.2.2
{
  server: {
    url: 'http://10.0.2.2:5080'
  }
}
```

---

## 🛠️ Development Tools

### Browser DevTools Extensions

Recommended:
- **Redux DevTools** - For state debugging
- **Angular DevTools** - For Angular debugging
- **Vue DevTools** - General framework tools

Install from Chrome Web Store

### Android Debugging

- **Chrome DevTools** - Open `chrome://inspect` while emulator running
- **Android Studio Profiler** - Monitor performance
- **Logcat** - View console logs

---

## 📊 Testing in Both Environments

### Unit Tests (Browser)
```bash
npm run test
npm run test:watch
```

### E2E Tests (Browser)
```bash
npm run e2e
npm run e2e:open
```

### Manual Testing Checklist

#### Browser:
- [ ] App loads
- [ ] Navigation works
- [ ] API calls succeed
- [ ] Forms validate
- [ ] Errors display correctly

#### Android:
- [ ] App launches
- [ ] Touch interactions work
- [ ] Orientation changes handled
- [ ] Camera/file access works (if used)
- [ ] Offline mode works (if supported)

---

## 🔐 Security Testing

### Browser
- DevTools → Security tab
- Check for mixed content warnings
- Verify HTTPS in production

### Android
- Monitor network traffic
- Check certificate pinning
- Review permissions in AndroidManifest.xml

---

## 📈 Next Steps

### 1. Test in Browser Now
```bash
# Already running on http://localhost:5051
# Open in any browser:
# Chrome, Firefox, Safari, Edge
```

### 2. Build for Android
```bash
npm run build:prod
npx cap sync android
npx cap open android
```

### 3. Test on Device
```bash
# Use physical Android device
# Or Android emulator
# Click Run in Android Studio
```

### 4. Iterate & Develop
```bash
# Make changes
# Browser: Auto-refreshes
# Android: Rebuild and deploy
```

---

## 🎯 Quick Commands Reference

### Browser

```bash
# Start dev server
npm start

# Watch mode (for development)
npm run test:watch

# E2E tests
npm run e2e:open
```

### Android

```bash
# Build production
npm run build:prod

# Sync with Android
npx cap sync android

# Open in Android Studio
npx cap open android

# View logs
npx cap run android
```

### Docker (Backend Services)

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

---

## 📱 Device-Specific Testing

### iOS (Using Xcode)

If you have macOS:
```bash
npx cap open ios
```

Then use Xcode to run on iOS simulator or device.

### Progressive Web App (PWA)

The app includes PWA support:
```bash
# Test PWA features
npm run build:prod

# Serve locally
npx http-server www/
```

---

## 🌍 Network Testing

### Test from Another Machine

Find your machine IP:
```bash
# Windows
ipconfig  # Look for IPv4 Address

# macOS/Linux
ifconfig  # Look for inet
```

Then access from another machine:
```
http://YOUR_MACHINE_IP:5051
```

Useful for:
- Testing on actual networks
- Testing across devices
- Demonstrating to others

---

## 📝 Development Environment

Current Status:
- ✅ Angular CLI: 18.2.0
- ✅ Node.js: 20.x
- ✅ npm: 10.x
- ✅ Ionic: 8.3.0
- ✅ Capacitor: 6.1.2
- ✅ TypeScript: 5.5.4

### Update if needed:

```bash
# Update Angular CLI
npm install -g @angular/cli@latest

# Update project dependencies
npm update
```

---

## 🚀 Production Build

When ready to deploy:

```bash
# Build optimized
npm run build:prod

# Results in www/ directory
# Ready for web hosting

# For Android:
# Build Android Studio project
# Generate signed APK/AAB for Play Store
```

---

## Summary

✅ **Browser**: Running now on http://localhost:5051  
✅ **Android**: Ready to build and deploy  
✅ **API**: Configured at http://localhost:5080  
✅ **Testing**: Unit and E2E tests ready  

**Next**: Open browser or start Android build!

---

**Commands Reference Card:**

```
# Browser
npm start              # Run dev server

# Mobile
npm run build:prod    # Build for Android
npx cap sync android  # Sync with Android
npx cap open android  # Open in Android Studio

# Services
docker-compose up -d  # Start API + databases
docker-compose down   # Stop services

# Testing
npm run test          # Unit tests
npm run e2e:open      # E2E tests (interactive)
```
