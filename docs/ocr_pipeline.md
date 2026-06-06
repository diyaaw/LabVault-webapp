# HealthScan — OCR Pipeline Deep Dive (Interview Guide)

## 🏗️ Architecture Overview

The OCR pipeline is a **multi-service, multi-strategy system** split across two codebases:

| Layer | Tech | Role |
|---|---|---|
| **Node.js Backend** | Express.js | API gateway, file upload, orchestration, DB writes |
| **Python OCR Microservice** | Flask (port `5001`) | Document-to-text extraction (Gemini / pdfplumber / Tesseract) |
| **AI Engine** | Groq API (LLaMA 3.1) / Ollama | Biomarker extraction + patient-friendly summary |
| **Storage** | Cloudinary | Stores original uploaded files (PDFs/Images) |
| **Database** | MongoDB (Mongoose) | Persists reports, biomarkers, AI analysis |

---

## 🔁 End-to-End Pipeline Flow

```
User uploads file (PDF / Image)
        │
        ▼
[1] Node.js Backend — reportController.uploadReport()
        │  ├─ Saves file → Cloudinary (gets back a secure HTTPS URL)
        │  ├─ Creates Report document in MongoDB (status: 'processing')
        │  └─ Responds IMMEDIATELY to client (non-blocking)
        │
        ▼
[2] Background Pipeline — setImmediate() (fire-and-forget)
        │
        ▼
[3] aiService.extractBiomarkersFromDocument(fileUrl)
        │  └─ POSTs file to Python OCR Service at http://127.0.0.1:5001/ocr/process
        │
        ▼
[4] Python OCR Microservice — process_file_in_memory()
        │
        │  ┌─────────────────────────────────────────────┐
        │  │        3-Strategy Cascade (waterfall)        │
        │  │                                              │
        │  │  Strategy 1 (PRIMARY): Gemini Vision AI      │
        │  │   → Convert PDF pages → JPEG images          │
        │  │   → Send ALL images + specialized prompt     │
        │  │     to gemini-1.5-flash in one API call      │
        │  │   → Returns verbatim text                    │
        │  │                                              │
        │  │  Strategy 2 (FALLBACK A): pdfplumber         │
        │  │   → Reads native text layer of digital PDFs  │
        │  │   → Also extracts structured table data      │
        │  │   → Used only if text layer > 500 chars      │
        │  │                                              │
        │  │  Strategy 3 (FALLBACK B): Tesseract OCR      │
        │  │   → Grayscale → Contrast enhance (2x)        │
        │  │   → Sharpening → pytesseract (PSM 4, OEM 3)  │
        │  │   → Last resort for scanned images           │
        │  └─────────────────────────────────────────────┘
        │
        ▼
[5] Extracted raw text returned to Node.js as JSON
        │  { text: "...", length: N, status: "success" }
        │
        ▼
[6] aiService.analyzeReportUniversal(rawText, 'en')
        │  → Builds structured LLM prompt (2 tasks in 1 pass):
        │     Task A: Extract every biomarker → JSON array
        │     Task B: Generate patient-friendly summary
        │  → Calls Groq API (llama-3.1-8b-instant) [PRIMARY]
        │  → Falls back to local Ollama (llama3.2) [FALLBACK]
        │  → Returns { biomarkers: [...], summary: "..." }
        │
        ▼
[7] aiService.generateDoctorBrief(rawText, biomarkers)
        │  → Separate LLM call, clinical terminology only
        │  → No analogies, no emojis — for doctors, not patients
        │
        ▼
[8] MongoDB Writes
        │  ├─ ReportBiomarker — one document per biomarker
        │  │   (value, unit, min, max, severity, trend vs previous)
        │  ├─ ReportAiAnalysis — OCR text, patient summary, doctor brief
        │  └─ Report.status → 'ready'
```

---

## 📦 Component Deep Dives

### 1. File Upload — `reportController.uploadReport()`

- Uses **Multer + Cloudinary** multer-storage-cloudinary to stream uploads directly to Cloudinary
- Returns a `secure_url` (HTTPS) and `public_id` — **no file stored on disk**
- Immediately responds `201 Created` with `status: 'processing'` — the client is **never blocked**
- The actual AI pipeline runs via `setImmediate()` — this yields to Node's event loop first, keeping the response fast

> **Design Decision:** Fire-and-forget pattern with `setImmediate` ensures the HTTP response is returned before the (potentially 20-30 second) AI pipeline begins.

---

### 2. Python OCR Microservice — `process_file_in_memory()`

The orchestrator function selects the best OCR strategy at runtime:

#### Strategy 1: Gemini Vision (Primary)
```python
# PDF → convert_from_bytes (pdf2image + poppler) → list of PIL Images
# Images → serialized to JPEG bytes in-memory
# Sent to gemini-1.5-flash with a specialized clinical OCR prompt
```
**Why Gemini?** It understands table structure, reference ranges, and medical formatting that raw OCR misses. The prompt explicitly instructs it to:
- Preserve every table row (test name, value, unit, reference range)
- Not skip rows containing numbers
- Output plain text only (no markdown)

#### Strategy 2: pdfplumber (Fallback A — Digital PDFs)
```python
# Reads embedded text layer — 100% accuracy for typed/digital reports
# Also extracts tables explicitly, filters rows by presence of digits
# Only used if extracted text > 500 chars (quality gate)
# Secondary fallback: pypdf if pdfplumber itself fails
```
**Why:** If the PDF has a native text layer (i.e., it was not scanned), pdfplumber is faster and more accurate than any vision model.

#### Strategy 3: Tesseract (Fallback B — Scanned Images)
```python
img.convert('L')               # Grayscale
ImageEnhance.Contrast(x).enhance(2.0)  # 2x contrast boost
ImageFilter.SHARPEN            # Sharpening
pytesseract(config='--psm 4 --oem 3')  # Block-of-text mode, LSTM engine
```
**PSM 4** = "Assume a single column of text of variable sizes" — best for lab reports.  
**OEM 3** = LSTM neural net engine — highest accuracy.

---

### 3. Node.js AI Engine — `analyzeReportUniversal()`

This is the **core intelligence layer**. It takes raw OCR text and does two things in a **single LLM call**:

**Task A — Biomarker Extraction:**
- Extracts every measurable parameter into a structured JSON array
- Includes: `name`, `clinical_name`, `value`, `unit`, `min`, `max`, `severity`, `interpretation`, `confidence`
- Key guardrails in the prompt:
  - "Do NOT treat the report title (e.g., 'Kidney Function Test') as a biomarker"
  - "Do NOT infer or generate parameters not present in the text"
  - "Extract reference ranges FROM THE TEXT, not from your internal knowledge"

**Task B — Patient-Friendly Summary:**
- Written in plain language with emojis and headers
- Starts with abnormalities (`🚨 Important Abnormalities`)
- Uses analogies ("Think of your kidneys as your body's filter system")
- Ends with a "Your Next Steps" section
- Supports multilingual output: **Hindi, Marathi, Telugu, English**

**LLM Engine Selection:**
```javascript
const useGroq = GROQ_API_KEY && !GROQ_API_KEY.includes('your_groq');
// Groq (cloud): llama-3.1-8b-instant, timeout: 20s
// Ollama (local): llama3.2, timeout: 60s
```

---

### 4. Biomarker Severity Classification

In `reportController.js`, after receiving biomarkers from the AI:

```javascript
const raw = (b.severity || 'Normal').toLowerCase();
let severity = 'Normal';
if (raw.includes('critical') || raw.includes('danger'))    severity = 'Critical';
else if (raw.includes('moderate') || raw.includes('high')
      || raw.includes('low'))                               severity = 'Moderate';
else if (raw.includes('mild') || raw.includes('border'))   severity = 'Mild';
```

**Trend Detection:**
```javascript
// Compare with the LAST test result for same biomarker from MongoDB
const lastResult = await ReportBiomarker.findOne({ patientId, biomarkerName })
                       .sort({ testDate: -1 });
let trend = 'Stable';
if (val > lastResult.value) trend = 'Increasing';
else if (val < lastResult.value) trend = 'Decreasing';
```
This powers the **longitudinal health trends** feature — the same biomarker across multiple reports.

---

### 5. Doctor Brief — `generateDoctorBrief()`

A **separate LLM call** with a completely different prompt persona:
- "You are a senior clinical consultant"
- Clinical/ICD-standard language only
- No emojis, no analogies, no greetings
- Max 120 words — concise for busy physicians
- Includes: panel type → key findings → impression → recommended follow-up

---

### 6. Voice Summary — TTS Pipeline

After the core OCR analysis, the system can also generate **audio briefings**:

| Audience | Voice Style | Service |
|---|---|---|
| **Patient** | Empathetic, warm | `rewriteService.rewriteAsEmpathetic()` → gTTS / Cloudinary |
| **Doctor (single report)** | Clinical briefing | `rewriteService.rewriteAsClinical()` |
| **Doctor (longitudinal)** | Trend narrative | `rewriteService.rewriteAsLongitudinal()` |

Audio URLs are cached in `ReportAiAnalysis.audioUrls` (a MongoDB Map) to avoid redundant TTS generation.

---

## ⚡ Key Design Decisions (Interview Talking Points)

| Decision | Reason |
|---|---|
| **Async / fire-and-forget** | OCR + AI takes 15–30s. Non-blocking UX is critical. |
| **3-strategy OCR waterfall** | Different document types need different approaches. No single OCR is best for all. |
| **Gemini as primary** | Superior understanding of medical table layouts vs. raw Tesseract. |
| **pdfplumber before Tesseract** | Digital PDFs have a native text layer — no need for image-based OCR. |
| **Single LLM pass** | Extracting biomarkers AND generating the summary in one call saves cost and latency. |
| **No file on disk** | Entire pipeline is in-memory (Python) + Cloudinary (Node.js) — no disk I/O bottlenecks. |
| **Multilingual LLM prompts** | Healthcare in India requires regional language support (Hindi, Marathi, Telugu). |
| **Separate doctor brief** | Patients and doctors need fundamentally different communication styles. |
| **Trend detection via DB lookup** | Enables longitudinal health tracking across multiple test reports over time. |

---

## 🗄️ MongoDB Data Models

```
Report              ← Master record (fileUrl, status, patientId, pathologyId)
ReportBiomarker     ← One per parameter (value, unit, min, max, severity, trend)
ReportAiAnalysis    ← OCR text, patient summary, doctor brief, audio URLs, translations
ReportAccess        ← RBAC — which doctors can see which reports
```

---

## 🔐 Access Control

- **Patient** → sees only their own reports
- **Pathology** → uploads on behalf of patients, sees their uploads
- **Doctor** → can only see reports where patient has explicitly granted access (`patient.doctorAccess[]`)
- **Admin** → sees everything

The doctor access check is enforced in every `getReportById`, `getReportSummary`, and `generateVoice` endpoint.
