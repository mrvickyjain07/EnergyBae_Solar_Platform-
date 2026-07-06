# EnergyBae Solar Platform

> AI-powered solar sizing tool for MSEDCL electricity bills — built with React 19, Vite, Tailwind CSS v4, and Gemini 2.5 Flash.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/energybae-solar-platform)

---

## Features

- 📄 **AI Bill OCR** — Upload any MSEDCL electricity bill (image or multi-page PDF up to 20 MB); Gemini 2.5 Flash extracts all fields including Marathi/Devanagari text
- ☀️ **Solar Sizing** — Automatic PV system sizing, annual generation estimate, savings, payback period, and carbon offset
- 📊 **12-Month History** — Reconstructs billing history from the bill's tables and charts
- 📥 **Excel Export** — Download a formatted solar sizing workbook
- 📋 **Google Sheets Export** — Save results directly to Google Drive via Picker UI
- 🏭 **Commercial Module** — Separate analysis flow for commercial/industrial/HT/TOD bills

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4, lucide-react, motion |
| Backend (Serverless) | Vercel Functions (TypeScript), `@vercel/node` |
| AI | Google Gemini 2.5 Flash (`@google/genai`) |
| Export | `xlsx` (in-memory workbook generation) |
| Google APIs | Sheets API, Drive API, Picker API (OAuth via Google Identity Services) |

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/energybae-solar-platform.git
git push -u origin main
```

### 2. Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Vercel auto-detects **Vite** — settings will be pre-filled:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3. Set Environment Variables

In the Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Description | Secret? |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | ✅ Yes |
| `VITE_GOOGLE_CLIENT_ID` | OAuth 2.0 Web Client ID from Google Cloud Console | ⚠️ Build-time |
| `VITE_GOOGLE_API_KEY` | API key restricted to Google Picker API | ⚠️ Build-time |

> **Note**: `VITE_*` variables are embedded into the frontend bundle at build time. They are not secrets but should be restricted (API key restrictions in GCP Console).

### 4. Deploy

Click **Deploy**. Vercel will build the Vite frontend and deploy the `/api/*` functions as serverless functions automatically.

---

## Local Development

```bash
# Install dependencies
npm install

# Install Vercel CLI (for local serverless function testing)
npm i -g vercel

# Link to your Vercel project (first time only)
vercel link

# Run locally — Vercel dev serves both frontend and API functions
vercel dev
```

Create a `.env.local` file with your keys (this file is gitignored):

```env
GEMINI_API_KEY=your_gemini_api_key
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_API_KEY=your_google_picker_api_key
```

---

## API Endpoints

All endpoints are Vercel Serverless Functions under `/api/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Health check — confirms Gemini key is configured |
| `POST` | `/api/extract` | Residential bill OCR (base64 file in body) |
| `POST` | `/api/download-excel` | Generate residential Excel workbook |
| `POST` | `/api/commercial/extract` | Commercial/Industrial bill OCR |
| `POST` | `/api/commercial/export` | Generate commercial Excel workbook |

---

## Project Structure

```
energybae-solar-platform/
├── api/                        # Vercel Serverless Functions
│   ├── _utils.ts               # Shared utilities (Gemini client, retry, sanitizer)
│   ├── status.ts               # GET /api/status
│   ├── extract.ts              # POST /api/extract
│   ├── download-excel.ts       # POST /api/download-excel
│   └── commercial/
│       ├── extract.ts          # POST /api/commercial/extract
│       └── export.ts           # POST /api/commercial/export
├── src/
│   ├── components/             # React UI components
│   ├── contexts/               # React context (theme)
│   ├── modules/commercial/     # Commercial bill analysis module
│   ├── services/               # Google Auth, Sheets, Drive, tariff calculator
│   ├── App.tsx                 # Main app component
│   ├── main.tsx                # React entry point
│   ├── types.ts                # Shared TypeScript types
│   └── worksheetModel.ts       # Residential Excel layout model
├── public/                     # Static assets (favicon, logos)
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite configuration
├── vercel.json                 # Vercel routing configuration
├── tsconfig.json               # TypeScript configuration
└── .env.example                # Environment variable template
```

---

## Environment Variables Reference

See [`.env.example`](.env.example) for a full template with descriptions.
