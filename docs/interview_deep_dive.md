# 🎓 LabVault — Deep Dive Interview Preparation Guide
> Source-code-accurate answers for every advanced technical question.
> Framework: **What we did → Why → Trade-off → What I'd improve**

---

## 🏗️ SECTION 1: Architecture & System Design

---

### Q1. "Walk me through the overall architecture of LabVault."

**What we did:**
LabVault is a **three-tier, polyglot microservice architecture**:

```
[Next.js Frontend :3000]
        ↕  REST API (Axios + HttpOnly Cookies)
[Node.js Express Backend :5000]
        ↕  Axios HTTP IPC
[Python Flask OCR Microservice :5001]
        ↕  google-generativeai SDK
[Gemini 1.5 Flash Vision API — Cloud]
        ↕  Multer → CloudinaryStorage
[Cloudinary CDN — File Storage]
        ↕  Mongoose ODM
[MongoDB Atlas — Database]
```

**The Request Flow:**
1. Patient uploads a PDF from the Next.js frontend.
2. Multer (configured with `CloudinaryStorage`) intercepts the multipart stream and uploads the file directly to Cloudinary, returning an absolute HTTPS URL.
3. Express saves a MongoDB `Report` document with status `'processing'` and immediately sends `201 Created` back to the frontend.
4. `setImmediate()` triggers a background pipeline — Node calls the Python OCR microservice at `http://127.0.0.1:5001/ocr/process`, passing the file via Axios multipart stream.
5. Python runs Gemini Vision (primary), pdfplumber (digital fallback), or Tesseract (offline fallback) to extract raw text.
6. Node's `aiService.js` passes that raw text to Gemini/Groq to structure it into JSON biomarkers and generate multilingual summaries.
7. MongoDB is updated with biomarkers, trends, and summaries. Report status changes to `'ready'`.
8. Frontend polls `GET /api/reports/:id/status` and re-renders the dashboard when status changes.

**Why this design:**
- Decoupled services means Python and Node can fail, restart, or scale independently.
- Cloudinary offloads binary file serving from our backend, keeping Express focused on business logic.
- `setImmediate` keeps the Node event loop non-blocking.

**Trade-off:** `setImmediate` is in-memory. If the server restarts mid-extraction, that job is lost. A production system would use a durable queue (BullMQ, RabbitMQ) so jobs survive restarts.

---

### Q2. "Why did you choose Next.js over a pure React SPA? Did you use SSR, SSG, or ISR?"

**What we did:**
We chose Next.js 14 with the App Router. Our usage is primarily **Client-Side Rendering (CSR)** for all dashboard pages, marked with `'use client'` at the top of each file.

**Why Next.js over plain React:**
- Next.js gives us built-in routing (file-system based), eliminating the need for React Router.
- The App Router supports **Server Components** natively, which we can adopt incrementally.
- Next.js handles API proxying, environment variable management (`NEXT_PUBLIC_*`), and production image optimization out of the box.

**Did we use SSR/SSG/ISR?**
Not in the current version. Medical dashboards are personalized per-user and change frequently, so SSG (pre-rendered at build time) makes no sense here. SSR would require passing JWT cookies server-side on every request, adding complexity we didn't need.

**What I'd do in production:**
- SSR the public landing/marketing pages for better SEO.
- Use React Suspense + Server Components for the initial report list skeleton, reducing the time-to-first-meaningful-paint.

---

### Q3. "How did you structure MongoDB schemas? References or embedding?"

**What we did:** We used a **hybrid strategy** — embedding for tight ownership, references for independent entities.

| Relationship | Strategy | Reason |
|:---|:---|:---|
| Patient → doctorAccess | **Embedded array** of ObjectIds | Fast single-query ACL check |
| Report → Patient | **Reference** (`patientId` field) | Reports are independent documents with their own lifecycle |
| ReportBiomarker → Report | **Reference** (`reportId`, `patientId`) | Biomarkers need to be queried across reports for trend analysis |
| User → Tokens | **Embedded** in User document | Tokens are always accessed alongside user identity |

**The doctorAccess design explained:**
```javascript
// User.js schema
doctorAccess: [{ type: Schema.Types.ObjectId, ref: 'User' }]
```
When a doctor requests a patient's data, authorization is checked in ONE query:
```javascript
await User.findOne({ _id: patientId, doctorAccess: req.user.id })
```
MongoDB's native array containment check (`$in` semantics) makes this an O(1) indexed lookup.

**Trade-off:** A separate `DoctorAccess` collection would allow richer metadata (e.g., `grantedAt`, `expiresAt`, `accessScope`). We chose the embedded array for read-time performance at the cost of future metadata extensibility.

---

## 🔐 SECTION 2: Role-Based Access Control

---

### Q4. "What roles did you define, and how did you enforce them?"

**Roles defined:**
- `patient` — can upload reports, grant/revoke doctor access, view their own data
- `doctor` — can view authorized patient history, add clinical notes, run AI chat
- `pathology` — can upload reports for registered patients, view lab analytics
- `admin` / `SuperAdmin` — can approve, reject, and suspend user accounts

**How we enforce them:**
We use a **declarative Express middleware** called `authMiddleware` that wraps every protected route:

```javascript
// Route declaration — completely declarative
router.get('/shared-reports', authMiddleware('doctor'), reportController.getSharedReports);
router.post('/upload',        authMiddleware(['pathology', 'patient']), ...);
```

The middleware chain runs in order:
1. `verifyJWT.js` — decrypts the HttpOnly cookie, validates the signature, attaches `req.user`
2. `authMiddleware.js` — checks `req.user.role` against the allowed roles array
3. For `doctor` and `pathology` roles — does a **real-time DB lookup** to verify `status === 'APPROVED'`
4. If all checks pass — calls `next()` and the controller executes

**Why middleware over decorators or controller-level checks:**
- Single responsibility: security logic lives in one place, not scattered across 30 controllers
- Declarative: you can read the entire security policy of the app just by reading the routes files
- Fail-safe: if you forget to add the middleware, the route is unprotected — which is visible and auditable, not hidden inside controller logic

---

### Q5. "Where does authorization live — frontend, backend, or both? What's the risk of frontend-only?"

**What we did:** Authorization is **enforced exclusively on the backend**. The frontend only uses role information to conditionally render UI elements (e.g., hiding the "Admin Panel" button for non-admins).

**The risk of frontend-only authorization:**
Frontend authorization is purely cosmetic. Any user can open DevTools, modify `localStorage`, or use a tool like Postman to bypass the UI entirely and call backend endpoints directly. If the backend has no authorization layer, a patient could hit `GET /api/doctor/patients` with a forged role claim and receive other patients' medical histories.

**Our backend defense:**
Every sensitive database query includes the authenticated token's ID to prevent privilege escalation:
```javascript
// Even if role check passes, data scope is locked to the token owner
const report = await Report.findOne({ _id: reportId, patientId: req.user.id });
// Returns null if patientId doesn't match — even if the reportId is correct
```

---

### Q6. "How did you handle JWT expiry and refresh token rotation? What happens if a refresh token is stolen?"

**What we did:**
We issue two tokens on login:
- **Access Token** — short-lived (15 minutes), used on every API request
- **Refresh Token** — long-lived (7 days), stored in a separate HttpOnly cookie, used only to issue new access tokens

Both are stored in `HttpOnly; Secure; SameSite=Strict` cookies, making them inaccessible to JavaScript.

**Refresh flow:**
1. Access token expires → frontend gets `401 Unauthorized`
2. Frontend automatically calls `POST /api/auth/refresh`
3. Backend verifies the refresh token's signature and expiry
4. Issues a new access token and returns it

**If a refresh token is stolen:**
This is the core weakness of stateless JWT systems. With a stateless approach, a stolen refresh token is valid until it expires (7 days). Our current mitigation:
- `SameSite=Strict` prevents the token from being sent in cross-origin requests (blocks CSRF)
- `HttpOnly` prevents JavaScript access (blocks XSS)

**What I'd add in production:**
Implement **Refresh Token Rotation** — every time a refresh token is used, it is invalidated and a new one is issued. If the old token is used again (replay attack), both tokens are immediately revoked and the user is logged out. This is stored in a `refreshTokens` whitelist in MongoDB or Redis.

---

### Q7. "If a patient revokes a doctor's access, how does that propagate in real time?"

**What we did:**
Revocation is handled by the `accessController.revokeAccess` function which runs a MongoDB `$pull` operation:
```javascript
await User.findByIdAndUpdate(req.user.id, {
    $pull: { doctorAccess: doctorId }
});
```

This removes the doctor's ObjectId from the patient's `doctorAccess` array instantly in MongoDB.

**How it propagates:**
Because our backend performs a **real-time database lookup on every doctor request** (not just at login time), the revocation is effective immediately. The next time the doctor calls any patient endpoint, the query:
```javascript
User.findOne({ _id: patientId, doctorAccess: req.user.id })
```
...returns `null`, and the doctor receives a `403 Forbidden` response — even if they have a valid, non-expired JWT token.

**Why this is architecturally important:**
In a pure JWT stateless system, you cannot revoke access without invalidating the token. By using DB-level ACL checks on every request, we get real-time revocation without needing token blacklisting.

---

## 🧠 SECTION 3: OCR & Biomarker Extraction

---

### Q8. "Which OCR engine did you use, and why? How did you handle skewed or low-quality scans?"

**What we did:**
We built a **three-tier resilient OCR pipeline** inside our Python microservice (`ocr_service/services/ocr_service.py`):

1. **Gemini 1.5 Flash Vision (Primary):** For images and scanned PDFs, we convert PDF pages to JPEG images in-memory using `pdf2image`, then pass them as base64-encoded image payloads to the Gemini Vision API. Gemini is layout-aware — it understands tables, columns, and structured medical report formats.

2. **pdfplumber (Digital Fallback):** For digitally-generated PDFs (not scanned), `pdfplumber` extracts text from the embedded text layer directly — no image conversion needed, extremely fast and accurate.

3. **Tesseract + PIL (Offline Fallback):** If both above fail, we use `pytesseract` with PIL image preprocessing (grayscale conversion, contrast enhancement, binary thresholding) to improve OCR accuracy on low-quality or skewed scans.

**For skewed scans:**
The PIL preprocessing pipeline applies:
- Grayscale conversion to reduce noise
- Contrast enhancement to sharpen text edges
- Binary thresholding (Otsu's method) to distinguish text from background
- This significantly improves Tesseract accuracy on rotated or low-quality camera captures.

**Why Gemini first:**
Gemini's vision model understands visual context. It can read a two-column blood panel table, a margin notation, or a handwritten annotation — something Tesseract's character-by-character approach struggles with.

---

### Q9. "How did you parse unstructured OCR output into structured biomarker key-value pairs?"

**What we did:**
We use an **LLM-based structured extraction** approach, not regex. After OCR extracts raw text, we pass it to the Gemini/Groq LLM with a strict JSON schema prompt:

The prompt explicitly instructs the model:
```
Extract ALL biomarkers from this text. Return ONLY valid JSON.
Format:
{
  "biomarkers": [
    { "name": "Hemoglobin", "value": "14.2", "unit": "g/dL",
      "min": "12.0", "max": "17.5", "severity": "Normal",
      "interpretation": "..." }
  ]
}
```

The LLM returns structured JSON which we parse and save to MongoDB.

**Why LLM over regex:**
Medical reports have no universal format. Lab A might print `"Hgb: 14.2 g/dL [12.0-17.5]"` while Lab B prints `"HEMOGLOBIN | 14.2 | g/dL | Normal"`. A regex would need to anticipate every format. An LLM understands clinical context and extracts the right fields regardless of layout variation.

---

### Q10. "What's your confidence threshold, and what happens when OCR is uncertain?"

**What we did:**
The AI model returns a `confidence` field per biomarker (0.0 to 1.0), which we store in MongoDB:
```javascript
await ReportBiomarker.create({
    ...
    confidence: b.confidence || 0.9,
    source: 'ai_extracted'
});
```

**What happens when a value is unreadable:**
Our `cleanNum()` sanitizer attempts to parse any numeric content from the string. If it returns `null`:
- For the primary `value` field: we default to `0` using the `|| 0` fallback to prevent chart rendering failures
- For `referenceMin` / `referenceMax`: we store `null` and the frontend renders a `—` dash

**What I'd improve:**
Store `null` for unreadable primary values too. Use Recharts' `connectNulls` prop to bridge gaps in charts with a dashed line, and show a UI badge: *"Value could not be read — please re-upload a clearer scan."* This prevents a misleading `0` from appearing as a clinically valid reading.

---

### Q11. "How do you handle different lab report formats across different labs/hospitals?"

**What we did:**
This is precisely why we chose an LLM over regex. The LLM was trained on diverse medical document formats and can semantically identify biomarker patterns regardless of visual layout.

We also normalize all biomarker names to lowercase before saving:
```javascript
biomarkerName: String(b.name || 'Unknown').toLowerCase()
```
So `"HbA1c"`, `"GLYCATED HEMOGLOBIN"`, and `"hba1c"` all map to the same key in trend queries.

**Remaining limitation:**
True canonicalization (mapping `"A1C"`, `"HbA1c"`, and `"Glycated Hemoglobin"` to one definitive ID) requires a **Clinical Terminology Dictionary** (like LOINC codes or SNOMED CT). This is the production-level upgrade path.

---

## 🔬 SECTION 4: Biomarker Analysis

---

### Q12. "What does 'analysis' mean here — rule-based thresholds, trend detection, or something more sophisticated?"

**What we did:** A combination of both:

**Rule-based severity classification:**
The AI returns a raw severity string. We normalize it in the backend:
```javascript
if (raw.includes('critical') || raw.includes('danger')) severity = 'Critical';
else if (raw.includes('elevated') || raw.includes('high') || raw.includes('low')) severity = 'Moderate';
else if (raw.includes('mild') || raw.includes('border')) severity = 'Mild';
else severity = 'Normal';
```

**Trend detection (delta-based):**
Before saving each biomarker, we query the patient's most recent historical reading for that specific biomarker and compare values:
```javascript
if (val > lastResult.value) trend = 'Increasing';
else if (val < lastResult.value) trend = 'Decreasing';
else trend = 'Stable';
```

**More sophisticated intelligence:**
The doctor-facing dashboard uses a **Groq LLM** to synthesize the patient's entire biomarker history into a clinical voice brief — identifying patterns like "TSH has been increasing across three consecutive reports" — which is beyond simple delta comparison.

---

### Q13. "Where does reference range data live, and how do you handle age/sex/unit variations?"

**What we did:**
Reference ranges (`referenceMin`, `referenceMax`) are extracted directly from each PDF by the AI, alongside the biomarker value. They are stored per-biomarker-record in MongoDB:
```javascript
referenceMin: cleanNum(b.min),
referenceMax: cleanNum(b.max),
```

This means the reference range is **always the range printed on that specific lab's report**, not a global standard we maintain.

**Why this approach:**
Different labs, different countries, and different patient demographics use different normal ranges. Instead of maintaining our own reference database (which would need to account for age, sex, ethnicity, and lab equipment calibration), we trust the issuing lab's own printed standards.

**Trade-off:**
If a lab prints an incorrect range, our system inherits that error. The production solution would be to cross-reference against a standardized medical reference database (like LOINC) to flag discrepancies.

---

### Q14. "How did you avoid giving users what could be interpreted as medical advice?"

**What we did:**
This is handled through **strict prompt engineering constraints** in `rewriteService.js`:

```javascript
// Exact rules injected into every patient-facing summary prompt
"NEVER use scary words like dangerous, severe, or life-threatening."
"End with an encouraging closing line."
"Keep the total response under 200 words."
"Do NOT diagnose. Do NOT use scary language."
```

We also always append a disclaimer: *"Please consult your doctor for personalized advice."*

**For doctors**, we use a separate clinical prompt with opposite rules — professional, neutral, no emotional language, focused only on clinically relevant findings.

**Why this matters:**
In many jurisdictions, providing specific medical diagnoses or treatment recommendations through software without a licensed physician constitutes practicing medicine without a license. By framing output as "explanations" and "tips" rather than "diagnoses" and "prescriptions", we stay on the informational side of that boundary.

---

## 🌐 SECTION 5: Multilingual Voice Summaries

---

### Q15. "How did you generate voice summaries — TTS API, browser speechSynthesis, or something else?"

**What we did:**
We use the `google-tts-api` Node.js library (not the paid Google Cloud TTS API) as our primary engine, with the Python OCR service's `/tts` endpoint as a fallback.

**The exact flow (`ttsService.js` Lines 37–46):**
1. The text summary is cleaned — markdown formatting (`**`, `##`) is stripped because `"**Hemoglobin**"` sounds terrible when read aloud.
2. Text is truncated to 900 characters (approximately 45 seconds of audio) to keep files lean.
3. `googleTTS.getAllAudioBase64()` is called — this handles Google's 200-character-per-chunk limit automatically, chunking and fetching multiple audio segments.
4. All MP3 chunks are merged into a single `Buffer` using `Buffer.concat()`.
5. The merged buffer is written to `/uploads/audio/voice_summary_<timestamp>_<lang>.mp3` on disk.
6. The file path is returned to the frontend for playback.

**Why not browser `speechSynthesis`:**
Browser TTS has no Hindi, Marathi, or Telugu support on most devices, produces robotic output, and cannot generate a downloadable file.

---

### Q16. "What languages did you support, and how did you handle translation?"

**What we did:**
We support 8 Indian languages: English, Hindi, Marathi, Telugu, Punjabi, Tamil, Kannada, and Gujarati.

We do **not** use a separate translation API. Instead, we use **Prompt-Injected Language Conditioning** — the language instruction is embedded directly into the primary LLM prompt:

```javascript
// rewriteService.js — the exact language instruction injected
hi: `भाषा नियम (अनिवार्य): पूरा संदेश हिंदी में लिखें।
     केवल ये अंग्रेजी में रखें: टेस्ट के नाम, इकाइयाँ (mg/dL) और संख्याएँ।`
```

**Why no translation API:**
A separate translation step (Generate English → Translate to Hindi) would lose medical context. The LLM, conditioned in Hindi from the start, naturally applies the correct clinical vocabulary and sentence structure for that language, while keeping test names and units in English for clinical accuracy.

**Hybrid Language Policy:**
Medical test names, numeric values, and units ALWAYS stay in English even inside vernacular summaries. So a Hindi summary reads:
`"आपके Hemoglobin का स्तर 10.5 g/dL है, जो सामान्य से थोड़ा कम है।"`
This keeps the output readable by both the patient AND their doctor.

---

### Q17. "How do you ensure medical terminology is accurate after translation?"

**What we did:**
Our **Hybrid Language Policy** is the core accuracy mechanism — by keeping clinical test names, values, and units in English, we ensure that the clinically critical data points are never lost in translation.

**What I'd add in production:**
A **Post-Translation Validation Layer** using a medical terminology verifier that checks that all original biomarker names and values appear verbatim in the translated output. Any missing clinical term would trigger a fallback to English for that specific sentence.

---

## ☁️ SECTION 6: Cloudinary Integration

---

### Q18. "How did you handle access control on Cloudinary assets? Public or signed URLs?"

**What we did:**
Our reports are uploaded using `CloudinaryStorage` with `resource_type: 'raw'`, which stores them as raw binary files accessible via their standard Cloudinary HTTPS URL.

**Current state: Public URLs**
The Cloudinary URLs are currently public — anyone with the URL can access the file. Security is enforced at the **application layer**, not at the CDN layer. Our backend validates JWT tokens before ever returning a report URL to a client.

**The production upgrade:**
Generate **Signed Delivery URLs** with a short TTL (time-to-live) of 60 seconds. The URL expires after the TTL, meaning even if someone copies the URL from their browser's network tab, it becomes invalid within a minute:
```javascript
cloudinary.url(publicId, { sign_url: true, expires_at: Math.floor(Date.now()/1000) + 60 })
```

---

### Q19. "What's your upload pipeline — browser direct upload or routed through the backend?"

**What we did:**
All uploads are **routed through our Express backend** using Multer with `CloudinaryStorage`. The frontend sends the file as `multipart/form-data` to our Express endpoint, Multer intercepts the stream and pipes it directly to Cloudinary without writing to disk, and the Cloudinary URL is returned to our controller.

**Why not direct browser-to-Cloudinary upload:**
Direct browser uploads would expose our Cloudinary API key and upload preset to the client. A malicious user could then upload any file to our Cloudinary account, consuming our storage quota. Routing through the backend keeps credentials server-side and allows us to validate file type, size, and user authorization before the upload proceeds.

---

### Q20. "How did you handle file size limits, format validation, and malicious file uploads?"

**What we did:**
Multer is configured with:
- **File size limit:** Enforced by Multer's `limits.fileSize` option
- **Format validation:** `fileFilter` function checks `mimetype` — only `application/pdf` and image MIME types are accepted
- **Malicious file protection:** By using Cloudinary's `resource_type: 'raw'`, files are stored as inert binary blobs — they are never executed server-side

**Trade-off:**
MIME type checking can be spoofed — a `.exe` renamed to `.pdf` may pass MIME validation. The production hardening would add **magic byte inspection** (reading the first 4-8 bytes of the file buffer to verify the actual binary signature matches the declared format).

---

## ⚡ SECTION 7: Performance & Scalability

---

### Q21. "Is OCR synchronous or async? How do you notify the user when it's done?"

**What we did:**
OCR is **fully asynchronous** using Node.js's `setImmediate()`.

**The notification mechanism:**
The frontend uses **polling** — it calls `GET /api/reports/:id/status` every few seconds after an upload. When the backend changes the status from `'processing'` to `'ready'` (or `'failed'`), the frontend re-renders the report card with the extracted data.

**Why polling over WebSockets:**
WebSockets require persistent TCP connections and additional infrastructure (Socket.io server). For our scale, polling every 3-5 seconds is simple, reliable, and sufficient. Each poll is a tiny HTTP GET request.

**What I'd use at scale:**
Server-Sent Events (SSE) — a lightweight, one-way persistent HTTP connection from server to client. When processing completes, the server pushes a single event to the client with zero polling overhead.

---

### Q22. "How did you paginate large report histories in MongoDB?"

**What we did:**
We use **cursor-based pagination** via Mongoose's `.skip()` and `.limit()` operators:
```javascript
const reports = await Report.find({ patientId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
```

**Trade-off of offset pagination:**
`.skip()` is inefficient on large collections because MongoDB must traverse and discard all preceding documents. For a patient with 10,000 reports requesting page 500, MongoDB skips 249,500 records.

**Production upgrade:**
**Keyset/cursor pagination** — instead of `skip`, use the last document's `_id` or `createdAt` as a cursor:
```javascript
Report.find({ patientId, _id: { $lt: lastSeenId } }).limit(20).sort({ _id: -1 })
```
This is O(log n) regardless of page number because it uses the index directly.

---

### Q23. "Did you implement any caching? Where would it help most?"

**What we did:**
No explicit caching layer in the current version. Cloudinary provides CDN-level caching for static file delivery automatically.

**Where caching would help most (in priority order):**

1. **Analytics aggregation (`GET /api/analytics/:patientId`)** — This endpoint runs multiple MongoDB aggregations across `ReportBiomarker` and `Report` collections. Since this data changes only when a new report is processed, it is a perfect candidate for a **Redis cache with a 5-minute TTL** that is invalidated on new report upload.

2. **Doctor patient list (`GET /api/doctor/patients`)** — This requires joining across the `User` collection and `Report` collection. A short TTL cache (60 seconds) would eliminate redundant DB joins on every dashboard refresh.

3. **Multilingual summaries** — Once generated, a report's summary never changes. Caching it in MongoDB (which we already do in the `Report` document) eliminates re-generation on every view.

---

## 🧪 SECTION 8: Testing & DevOps

---

### Q24. "What was your testing strategy?"

**What we did:**
Manual testing and integration testing via Postman throughout development. We did not implement automated unit or E2E tests in this version.

**What I'd implement in production:**

- **Unit tests (Jest):** Test `cleanNum()` sanitizer edge cases, trend calculation logic, and severity normalization with 20+ test vectors (nulls, negative numbers, strings, scientific notation).
- **Integration tests (Supertest):** Test the full middleware chain — valid token + correct role → 200, valid token + wrong role → 403, expired token → 401.
- **E2E tests (Playwright or Cypress):** Simulate a full user journey: register → upload PDF → wait for processing → view analytics → grant doctor access → verify doctor can view.
- **Contract tests:** Validate that the Python OCR service always returns the expected JSON shape, preventing silent schema breakage between services.

**Coverage goal:** 80%+ on business-critical paths (auth middleware, biomarker extraction, access control).

---

### Q25. "How did you manage environment secrets across dev and prod?"

**What we did:**
We use `.env` files in each service directory, excluded from git via `.gitignore`:
- `backend/.env` — `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `GOOGLE_AI_STUDIO_API_KEY`, `GROQ_API_KEY`, `CLOUDINARY_*`, `MONGO_URI`
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL`
- `ocr_service/.env` — `GOOGLE_AI_STUDIO_API_KEY`

**Why separate `.env` files per service:**
Each service has its own secret scope. The frontend never needs database credentials. The Python service never needs JWT secrets. Separation follows the principle of least privilege for secrets.

**Production upgrade path:**
Move secrets to a **dedicated secrets manager** (AWS Secrets Manager, HashiCorp Vault, or Vercel Environment Variables). Secrets are pulled at runtime, never stored in `.env` files, and can be rotated without redeployment. Each service is granted only the IAM role permission to read its own secrets.

---
*Created for LabVault deep-dive interview preparation. Answers are source-code accurate.*
