# CRI-BLO: Fiber Technician Field Evidence System

A mobile-first Progressive Web Application (PWA) designed for field technicians to capture, document, and manage evidence during fiber intervention work.

## Features

### Core Capabilities
- **📷 Field Camera**: Capture high-quality photos with automatic metadata collection
- **🗺️ GPS/Location Tracking**: Real-time GPS acquisition with auto-retry and reverse geocoding
- **💧 Photo Watermarking**: Automatic timestamp, GPS coordinates, and address overlay on evidence photos
- **📱 Offline-First Storage**: Dexie IndexedDB for local data persistence and sync queue management
- **🌐 Network Sync**: Automatic OneDrive/Azure integration with exponential backoff retry logic
- **🤖 AI Assistant**: Context-aware ChatGPT integration for field guidance and evidence validation
- **📤 Multi-Format Export**: PDF reports, JSON data, and CSV spreadsheets
- **🔗 Built-in Browser**: Access documentation and support without leaving the app

### Technical Architecture

#### Frontend Stack
- **React 18** with TypeScript
- **Vite** for optimized builds
- **Tailwind CSS** for responsive design
- **Radix UI** for accessible components

#### Mobile Integration
- **Capacitor 5** for iOS/Android bridge
- **Native Camera**: High-resolution photo capture with EXIF data
- **Native Geolocation**: Accurate GPS with satellite/WiFi fallback
- **Native Network Monitoring**: Real-time connectivity detection
- **Native File System**: Secure local storage and cloud sync

#### Data Management
- **Dexie 3**: IndexedDB wrapper for local persistence
- **Structured Schema**: Interventions, photos, sync queue tables
- **Automatic Cleanup**: 30-day retention policy for synced data

#### Cloud Integration
- **Microsoft Azure**: OAuth 2.0 authentication via MSAL
- **OneDrive API**: Automatic photo/report backup
- **Exponential Backoff**: Smart retry strategy for failed syncs

#### AI & Intelligence
- **OpenAI GPT-4**: Context-aware field assistance
- **Real-time Validation**: Evidence completeness checking
- **Smart Suggestions**: Missing data alerts and recommendations

## Project Structure

```
src/
├── app/
│   └── FieldWorkApp.tsx          # Main application shell
├── components/
│   ├── CameraView.tsx             # Camera capture UI
│   ├── PhotoEvidenceView.tsx       # Photo display and watermarking
│   ├── FieldWorkDashboard.tsx      # Work progress tracker
│   ├── GPSStatusIndicator.tsx      # GPS status display
│   ├── SyncStatusIndicator.tsx     # Sync status display
│   ├── AIAssistantView.tsx         # AI chat interface
│   └── ExportOptions.tsx           # Export format selector
├── hooks/
│   ├── useFieldCamera.ts           # Camera management
│   ├── useLocation.ts              # GPS and location
│   ├── usePhotoWatermark.ts        # Photo watermarking
│   ├── useOfflineStorage.ts        # Local storage
│   ├── useSync.ts                  # Network and sync
│   ├── useAIAssistant.ts           # AI integration
│   └── useExport.ts                # Export functionality
├── lib/
│   ├── camera/
│   │   └── CameraService.ts        # Capacitor Camera API
│   ├── location/
│   │   └── LocationService.ts      # GPS and geocoding
│   ├── photo/
│   │   └── PhotoWatermarkService.ts # Canvas-based watermarking
│   ├── storage/
│   │   ├── database.ts             # Dexie schema
│   │   └── OfflineStorageService.ts # Storage operations
│   ├── sync/
│   │   ├── NetworkService.ts       # Network monitoring
│   │   └── OneDriveSyncService.ts  # OneDrive integration
│   ├── ai/
│   │   └── AIAssistantService.ts   # OpenAI integration
│   ├── export/
│   │   └── ReportExportService.ts  # PDF/JSON/CSV export
│   └── browser/
│       └── InAppBrowserService.ts  # Built-in browser
└── styles/
    └── globals.css                # Tailwind directives
```

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Xcode (for iOS) or Android Studio (for Android)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials:
# - REACT_APP_AZURE_CLIENT_ID
# - REACT_APP_AZURE_AUTHORITY
# - REACT_APP_OPENAI_KEY

# Build for web
npm run build

# Add native platforms
npm run android  # or ios

# Sync native code
npm run sync:android  # or sync:ios
```

## Development

```bash
# Start dev server
npm run dev

# Build and test
npm run build
npm run test

# Code quality
npm run lint
```

## Deployment

### Web (PWA)
```bash
npm run build
# Deploy dist/ folder to your hosting (Vercel, Azure Static Web Apps, etc.)
```

### iOS
```bash
npm run build
npm run sync:ios
# Open in Xcode: ios/App/App.xcworkspace
# Configure signing and build
```

### Android
```bash
npm run build
npm run sync:android
# Open in Android Studio: android/
# Configure signing and build
```

## Configuration

### Environment Variables
```env
# Azure/OneDrive
REACT_APP_AZURE_CLIENT_ID=your-client-id
REACT_APP_AZURE_AUTHORITY=https://login.microsoftonline.com/common
REACT_APP_REDIRECT_URI=http://localhost:3000

# OpenAI
REACT_APP_OPENAI_KEY=sk-...

# API Endpoints
REACT_APP_API_BASE_URL=https://api.example.com
```

### Capacitor Configuration
Edit `capacitor.config.ts` to customize:
- App ID and name
- Platform-specific settings
- Plugin configurations
- Server settings

## API Integration

### OneDrive Sync
- Uploads evidence photos and reports
- Creates folder structure: `reports/<intervention_id>/`
- Automatic retry with exponential backoff (max 1 hour)

### OpenAI Chat API
- Real-time AI assistance
- Context includes current intervention, photos, and location
- Max 500 tokens per response

### Nominatim (OSM)
- Free reverse geocoding service
- No API key required
- Fallback to formatted coordinates if service fails

## Security Considerations

- ✅ HTTPS only (enforced by Capacitor)
- ✅ OAuth 2.0 with MSAL for authentication
- ✅ Sensitive data stored locally only (IndexedDB)
- ✅ No sensitive data logged to console
- ✅ Automatic token refresh for API calls
- ✅ CORS configured for trusted origins only

## Performance Optimizations

- 📦 Code splitting with dynamic imports
- 🖼️ Image compression before sync (95% quality)
- 📱 Responsive images for different device sizes
- ⚡ IndexedDB for instant local access
- 🔄 Service Worker for offline support
- 📊 Lazy-loaded components

## Browser Support

- Chrome/Edge 90+
- Safari 14+
- Firefox 88+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Known Limitations

- GPS accuracy depends on device hardware and environmental factors
- Large photo batches (100+) may require pagination
- OneDrive sync limited to authenticated users with enterprise accounts
- AI responses limited to 500 tokens for performance

## Troubleshooting

### GPS not acquiring
1. Check location permissions in device settings
2. Verify device has GPS/WiFi enabled
3. Wait for satellite lock (typically 30 seconds)
4. App auto-retries up to 3 times with increasing intervals

### Sync failing
1. Check network connectivity (use SyncStatusIndicator)
2. Verify Azure credentials and OneDrive access
3. Check console for specific error messages
4. Manual retry from Settings panel

### Photos not watermarking
1. Ensure GPS location acquired first
2. Check browser canvas support (required for watermarking)
3. Verify sufficient device storage

## Contributing

Please follow the existing code structure and use TypeScript for all new files. Submit pull requests to the `develop` branch.

## License

Proprietary - CRI-BLO Field Evidence System

## Support

For technical support, visit: https://support.cri-blo.com
