# FieldEval Production Deployment Guide (Vercel Free Tier)

This guide walks you through deploying **FieldEval** to Vercel on the 100% free Hobby tier, configuring required environment variables securely in the Vercel dashboard, running smoke verification, and loading author sample data.

---

## 1. Safety & Cost Guarantees

- **100% Free Plan**: FieldEval runs within Vercel's Hobby (free) tier limits. No credit card is required.
- **Client Storage**: All photos and field observations are stored entirely on the user's phone in browser IndexedDB. Zero cloud database fees.
- **Serverless Compute**: Only `/api/infer` executes server-side code when scoring an image against Gemma 4 via Google Gemini API.
- **Execution Limits**: The inference route exports `export const maxDuration = 60;`, staying strictly within Vercel's 60-second free plan serverless execution ceiling.

---

## 2. Environment Variables Checklist

Set these variables directly inside the Vercel project dashboard under **Project Settings $\rightarrow$ Environment Variables**. *Never commit them to Git.*

| Variable Name | Required? | Classification | Default / Value | Description |
| :--- | :---: | :---: | :---: | :--- |
| `GEMINI_API_KEY` | **Yes** | **Secret** | *(Your Google Gemini API Key)* | Used by `@google/genai` to call Gemma 4 (`gemma-4-31b-it`). |
| `DAILY_CAP` | No | Non-Secret | `300` | In-memory ceiling limiting total inference calls per day to prevent quota exhaustion. |
| `PROVIDER` | No | Non-Secret | `gemini` | Vision model provider backend adapter. |
| `MODEL_ID` | No | Non-Secret | `gemma-4-31b-it` | Target open-weight vision model identifier. |
| `SENTRY_DSN` | No | Secret / Sensitive | *(Optional Sentry DSN)* | Distributed tracing endpoint for the inference pipeline. |

---

## 3. Step-by-Step Vercel Deployment

### Step 1: Connect Repository
1. Navigate to [vercel.com](https://vercel.com) and log into your account.
2. Click **"Add New..."** $\rightarrow$ **"Project"**.
3. Import your `greenforest` (FieldEval) Git repository.

### Step 2: Configure Project
1. **Framework Preset**: Next.js (automatically detected).
2. **Root Directory**: `./` (default).
3. **Build Command**: `next build` (default).
4. **Output Directory**: `.next` (default).

### Step 3: Add Environment Variables
Under the **Environment Variables** section, paste:
- `GEMINI_API_KEY`: *(Your key from Google AI Studio)*
- `DAILY_CAP`: `300`
- `PROVIDER`: `gemini`
- `SENTRY_DSN`: *(Optional DSN if monitoring traces in Sentry)*

### Step 4: Click Deploy
1. Click **"Deploy"**.
2. Wait for the build and deployment to complete (typically ~1-2 minutes on Vercel).
3. Copy your live deployment URL (e.g. `https://fieldeval-xxxx.vercel.app`).

---

## 4. Post-Deployment Verification (Smoke Test)

Run the included automated smoke test against your live Vercel URL:

```bash
node scripts/smoke.mjs https://YOUR-VERCEL-DEPLOYMENT-URL.vercel.app
```

The script automatically executes and reports 4 sequential checks:
1. `GET /`: Validates home page loads with HTTP 200 and renders the FIELDEVAL shell.
2. `GET /manifest.json`: Confirms PWA manifest is served with standalone display configuration.
3. `POST /api/infer` (invalid payload): Confirms server rejects malformed payloads with a `4xx` error without crashing.
4. `POST /api/infer` (sample image): Sends a valid JPEG payload to the live server, calls Gemma 4, and confirms HTTP 200 with `status: "ok"` and parsed answer.

---

## 5. Author's Field Session (Sample Data for Judges)

If your daily inference quota is reached, judges can still inspect the full evaluation results and statistical metrics:

1. **Location**: [`public/sample-session.jsonl`](file:///d:/projects/greenforest/public/sample-session.jsonl).
2. **Format**: One line per completed observation matching the `fieldeval.v1` schema.
3. **Usage**:
   - Judges click the **"Sample data from the author's field session"** button on the home screen or results screen.
   - The app parses the file, writes the observations to local IndexedDB, and renders the 6-scene results wall with exact match/miss cards, flip rate, and Wilson 95% confidence intervals.
4. **Strict Guarantee**: No fake observations are generated. Only observations provided from real field sessions are loaded.

---

## 6. Fallback Procedure (If Vercel Deployment Fails)

If deployment to Vercel is blocked (e.g. network restrictions, organization policies, or build timeouts):

1. **Run Locally in Production Mode**:
   ```bash
   npm run build
   npm run start -- -p 3000
   ```
2. **Expose via Secure Tunnel**:
   - Use Cloudflare Tunnel:
     ```bash
     npx cloudflared tunnel --url http://localhost:3000
     ```
   - Or ngrok:
     ```bash
     npx ngrok http 3000
     ```
3. **Phone Testing**:
   - Open the resulting HTTPS tunnel URL in mobile Safari or Chrome on your phone.
   - Test offline capture and live model scoring directly outdoors.
4. **Submission**:
   - Submit the live tunnel URL and include the screen demo video following the Demo Script in Section 7.
