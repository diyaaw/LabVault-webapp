# 🎓 LabVault Interview Master Preparation Guide

This master guide prepares you to explain the backend architecture, security design, and database engineering of **LabVault** with senior-level authority.

For every question, we use the industry-standard senior developer framework:
$$\text{What we did} \rightarrow \text{Why we did it} \rightarrow \text{Trade-offs considered}$$

---

## 🟢 Part 1: Basics (Almost Certain to Be Asked)

### 1. "Walk me through your API structure."
* **What we did:** We designed a RESTful API separated into modular routing folders inside `backend/src/routes/` (e.g., `authRoutes.js`, `reportRoutes.js`, `accessRoutes.js`, `doctorRoutes.js`, `patientRoutes.js`).
* **Why:** This maintains a highly modular codebase. Grouping routes by resource (e.g., `/api/reports`, `/api/auth`) makes the endpoints clean, intuitive, and easy to scale.
* **Trade-off considered:** We could have used a single mammoth routing file, which is faster to write initially but creates a merge-conflict nightmare and makes code reviews impossible as the team grows.

### 2. "Why did you separate routes by domain instead of by role?"
* **What we did:** We structured endpoints by **Resource/Domain** (e.g., `/api/reports/upload`) and used middleware to control access, rather than creating separate routers for roles (e.g., `/api/doctor/upload-report`).
* **Why:** Following standard REST practices ensures endpoints are centered around *data nouns* (resources) rather than *users*. It also keeps the codebase DRY (Don't Repeat Yourself)—for instance, both Patients and Labs can upload reports, so having a shared `/api/reports/upload` keeps logic unified.
* **Trade-off considered:** Structuring by role (e.g., `/api/pathology/upload`) makes it easier to write role-specific security wrappers initially but leads to massive code duplication and poor maintenance when roles overlap.

### 3. "What HTTP methods did you use and why?"
* **What we did:** We strictly adhered to HTTP verb semantics:
  * **POST:** Create records (e.g., `/api/auth/signup`, `/api/reports/upload`).
  * **GET:** Retrieve records/metadata (e.g., `/api/reports/:id/details`, `/api/doctor/patients`).
  * **PUT:** Complete resource updates (e.g., `/api/auth/profile`).
  * **DELETE:** Remove resources (e.g., `/api/patient/:id`).
* **Why:** Using standard HTTP verbs makes our API predictable, self-documenting, and fully compliant with global REST standards.
* **Trade-off considered:** We could have done everything using only `POST` requests, but that violates standard web caching protocols, makes API debugging difficult, and looks unprofessional to seasoned engineers.

### 4. "How does authentication work in your app?"
* **What we did:** We implemented a stateless token session strategy using JSON Web Tokens (JWT) stored in HTTP-Only, Secure cookies.
* **Why:** Stateless authentication means the server doesn't need to keep sessions in active RAM, allowing the backend to scale out to multiple servers easily. Storing tokens in cookies prevents client-side code from accessing them.
* **Trade-off considered:** We could have used server-side sessions (e.g., Express-Session with Redis). While sessions allow instant server-side revocation of all active logins, they introduce database query bottlenecks for every page load and increase infrastructure costs.

### 5. "What is a JWT and why HTTP-only cookies?"
* **What we did:** A JWT is a cryptographically signed JSON object used to store authenticated user details. We deliver this token to the browser inside an **HttpOnly cookie**.
* **Why:** Storing JWTs in standard LocalStorage makes them accessible to JavaScript. If your app is hit with a Cross-Site Scripting (XSS) attack (e.g., a malicious third-party NPM dependency), hackers can steal the token. HttpOnly cookies cannot be read by JavaScript, blocking XSS token theft completely.
* **Trade-off considered:** HttpOnly cookies are vulnerable to Cross-Site Request Forgery (CSRF) attacks. We mitigated this trade-off by setting the `SameSite: 'Strict'` and `Secure: true` cookie attributes, which instruct the browser to never attach the cookie to cross-origin requests.

### 6. "What's the difference between authentication and authorization?"
* **What we did:** 
  * **Authentication (Who are you?):** Handled by `verifyJWT.js`, which decrypts the incoming token and attaches the validated user profile (`req.user`) to the request.
  * **Authorization (What can you do?):** Handled by `authMiddleware.js`, which inspects the user's role (`req.user.role`) and status to determine if they are allowed to access that specific endpoint.
* **Why:** Keeping these concerns separate ensures modularity. You can change *who* is allowed on a route by altering the authorization array in your routes file without touching the authentication decryption code.
* **Trade-off considered:** Combining them into a single massive function is faster to write but results in spaghetti code that is extremely hard to test and audit.

---

## 🟡 Part 2: Intermediate (Very Likely)

### 7. "How do you protect routes — walk me through your middleware chain?"
* **What we did:** We implemented a sequential chain of middleware functions inside Express:
  $$\text{Request} \rightarrow \text{verifyJWT} \rightarrow \text{authMiddleware(roles)} \rightarrow \text{Real-time status check} \rightarrow \text{Controller}$$
* **Why:** Each layer acts as a specialized gatekeeper. If a token is expired, `verifyJWT` kills it. If the token is valid but the role is wrong, `authMiddleware` blocks it. Only clean, authorized requests reach our heavy database controllers.
* **Trade-off considered:** We could have handled security checks directly inside our controller functions. However, this violates the Single Responsibility Principle, leads to code duplication, and increases the risk of a developer forgetting a security check on a new endpoint.

### 8. "What happens if a Doctor tries to hit a Patient-only endpoint?"
* **What we did:** When the Doctor's request hits the patient route (e.g., `/api/reports/share` which is guarded by `authMiddleware(['patient'])`), the authorization layer checks `req.user.role`. Since `'doctor'` is not in the permitted array, the middleware terminates the request immediately by sending a `403 Forbidden` response.
* **Why:** To enforce strict least-privilege access boundaries. The core controller logic is never executed, protecting the system from privilege escalation.
* **Trade-off considered:** We could have written conditional logic inside the controller (`if (role === 'patient') ...`). This is harder to audit and scale compared to a clean, declarative middleware block on the route itself.

### 9. "Why does Doctor signup need multer but regular signup doesn't?"
* **What we did:** When a doctor registers, they must upload a degree/medical certificate. We process this file upload using **Multer** as a multipart/form-data parser, whereas regular patient signups are parsed as simple JSON.
* **Why:** Uploading binary files requires parsing multipart streams, which standard JSON body parsers (`express.json()`) cannot handle. Multer intercepts the stream, extracts the certificate file, uploads it to our secure storage, and adds the file path to `req.file`.
* **Trade-off considered:** We could have had the doctor register as a text-only user first, and then upload their file in a second step. However, this creates a disjointed UX and risks having unverified doctor documents dangling in the database.

### 10. "How does report sharing work between Patient and Doctor?"
* **What we did:** We support two modes of sharing:
  1. **Global Access:** The patient grants the doctor access to their entire dashboard. This adds the doctor's `ObjectId` to the patient's `doctorAccess` array.
  2. **Granular Access:** The patient shares a single specific report. This inserts a record into a separate **`ReportAccess`** collection mapping `{ reportId, doctorId }`.
* **Why:** This dual-layered strategy gives patients absolute control over their health information privacy, enabling them to share their entire history with their primary GP while sharing a single scan with a remote specialist.
* **Trade-off considered:** We could have made all access all-or-nothing (sharing everything). While simpler to code, it violates medical data privacy standards (like HIPAA) and would discourage patients concerned about sensitive histories.

### 11. "What does the AI pipeline look like after a PDF is uploaded?"
* **What we did:** We built a multi-stage background extraction pipeline:
  $$\text{PDF Uploaded to Cloudinary} \rightarrow \text{Saved to MongoDB as 'processing'} \rightarrow \text{setImmediate BG Job} \rightarrow \text{Python OCR Service} \rightarrow \text{Gemini AI JSON Parsing} \rightarrow \text{Biomarker Extraction/Trends} \rightarrow \text{Status 'ready'}$$
* **Why:** It completely separates file storage (Cloudinary), file text conversion (OCR), and clinical structuring (Gemini AI) into clean, decoupled, resilient operations.
* **Trade-off considered:** We could have done OCR and AI parsing directly in the Node.js main thread. However, doing so would freeze the server for all other active users whenever a large PDF is processed.

### 12. "Why async processing for AI extraction? Why not synchronous?"
* **What we did:** We returned a `201 Created` response to the frontend instantly, and triggered the AI parsing in the background using **`setImmediate()`**.
* **Why:** Running OCR and calling the Gemini API takes 5 to 15 seconds. If this were synchronous, the user’s browser tab would freeze, spinning endlessly until the request timed out, resulting in a terrible user experience.
* **Trade-off considered:** The trade-off is frontend complexity. Since the backend responds immediately, the frontend must dynamically check the status of the report (polling `/api/reports/:id/status` or using WebSockets) to show a loading spinner until the status changes from `'processing'` to `'ready'`.

### 13. "What is Cloudinary doing in your architecture?"
* **What we did:** We use Cloudinary as a dedicated Blob Storage CDN to host binary files (PDFs and Images), while keeping only metadata URLs in MongoDB.
* **Why:** Databases are designed for structured, high-speed text queries, not large binary streams. Storing files in MongoDB bloats database backups, slows down indexing, and easily hits MongoDB's strict 16MB document size limit.
* **Trade-off considered:** We could have saved files directly on our backend server's local disk. This is highly problematic because local disks do not scale—if you deploy your app across multiple load-balanced servers, a file uploaded to Server A will not be accessible to users hitting Server B.

### 14. "How do you handle the doctorAccess array — why an array on the patient document?"
* **What we did:** We embedded an array of Mongoose `ObjectId` references directly inside the Patient’s document in the `users` collection:
  `doctorAccess: [{ type: Schema.Types.ObjectId, ref: 'User' }]`
* **Why:** It allows for highly performant query-level authorization. When a doctor requests a patient's dashboard, we can verify their access in a single database step using:
  `await User.findOne({ _id: patientId, doctorAccess: req.user.id })`
* **Trade-off considered:** We could have used a traditional SQL-style relational "Join Table" (a separate `DoctorPatientAccess` collection). While a separate collection is cleaner for highly complex relational metadata (like `grantedAt`, `expiredAt`), it requires slow multi-collection queries or database aggregation lookups for every page load.

---

## 🔴 Part 3: Deep / Design (If Interviewer Is Technical)

### 15. "Why REST over GraphQL for this use case?"
* **What we did:** We designed a classic REST API instead of a GraphQL interface.
* **Why:** Medical report workflows are highly transactional (file uploads, downloading static summaries, generating audio). REST is perfect for standard, deterministic CRUD resources and works seamlessly with file upload middlewares (like Multer) and standard HTTP caching.
* **Trade-off considered:** GraphQL is excellent for complex, highly connected data queries where the client needs custom shapes of data. However, GraphQL introduces steep complexity for file uploads, lacks native HTTP caching, and requires complicated security setups to prevent malicious deep-nested queries.

### 16. "What are the security risks in a medical app and how did you mitigate them?"
* **What we did:** We identified and solved the top three medical application risks:
  1. **Data Leakage in Transit:** Solved by enforcing HTTPS TLS 1.3 across all communication.
  2. **Credential/Session Hijacking:** Solved using secure, `HttpOnly`, `SameSite: Strict` cookies for JWT storage.
  3. **Broken Object Level Authorization (BOLA):** Solved by never relying on client-side security checks—every database query matches the patient document against the logged-in user’s verified token ID.
* **Why:** Healthcare applications must comply with strict privacy laws (like HIPAA). A single leaked URL or SQL injection could lead to catastrophic legal and ethical consequences.
* **Trade-off considered:** We could have implemented end-to-end encrypted databases (where database admins cannot read the data). While highly secure, it prevents the backend AI engine from searching, analyzing, or running OCR pipelines on the reports.

### 17. "How would you scale the AI pipeline if 1000 users uploaded simultaneously?"
* **What we did:** Currently, the background execution uses standard in-memory Node.js `setImmediate()`.
* **Why:** For our initial scale, this is lightweight and requires zero extra infrastructure.
* **Trade-off considered (Scale Design):** If 1000 users upload files simultaneously, `setImmediate` will exhaust the server’s memory and crash the process. 
  To scale this, we would decouple the background worker entirely. We would push the upload task to a **Distributed Message Queue (like RabbitMQ, Amazon SQS, or BullMQ with Redis)**. Decoupled workers (running on separate machines) would pull jobs from this queue one-by-one. This protects our main web server from crashes and allows us to scale processing capacity up or down based on demand.

### 18. "What is least-privilege and where does it apply in your app?"
* **What we did:** The Principle of Least Privilege states that a user should only have access to the exact resources they need to perform their duties. We enforced this:
  * **Pathology Labs:** Can upload reports, but cannot add clinical doctor notes or view patient-doctor chat dashboards.
  * **Doctors:** Can view reports and trends, but cannot register new pathology centers or access SuperAdmin dashboards.
* **Why:** This minimizes the "blast radius." If a pathology lab's account is compromised, the hacker cannot read doctor notes or alter system configurations.
* **Trade-off considered:** Designing distinct authorization layers requires writing custom middlewares and route guards, which increases initial development time compared to having a single "all-access" token.

### 19. "How would you version your API if you had to introduce breaking changes?"
* **What we did:** We established path-based routing: `/api/v1/...` (implicitly or prepended).
* **Why:** If we introduce a breaking change in the future (e.g., completely restructuring the biomarker JSON format returned by Gemini), we can launch `/api/v2/reports` while keeping `/api/v1/reports` running. This ensures existing mobile apps or legacy frontend integrations don't break.
* **Trade-off considered:** We could use Header-based versioning (sending `Accept-Version: v2`). While cleaner conceptually, header versioning makes browser testing and client-side integration much more complicated.

### 20. "What would you do differently if you rebuilt this?"
* **What we did:** We built a monolithic Express backend with a separate Python microservice for OCR.
* **Why:** This kept deployment simple, development speed fast, and debugging straightforward.
* **Trade-off / Rebuild Strategy:** 
  If rebuilding, I would use **TypeScript** on the backend to enforce strict compile-time types for our complex medical data structures. I would also migrate our custom background pipelines (`setImmediate`) to a robust queue processor like **BullMQ** to make background jobs durable and safe against server restarts.

---

## 🔴 Part 4: Curveballs to Be Ready For

### 21. "What's the difference between PUT and PATCH? Which did you use and why?"
* **PUT:** Replaces the entire resource. You must send *all* fields, and fields not sent are set to null/default.
* **PATCH:** Performs partial updates. You only send the fields that changed.
* **What we did:** We used **PUT** for profile updates (e.g., `/api/auth/profile`) because we wanted to overwrite the profile record cleanly with the user's latest details.
* **Why:** PUT is simple to implement and fits standard forms where the user edits a copy of their complete details and hits "Save."
* **Trade-off considered:** PATCH is more network-efficient for large, complex documents because it avoids transmitting unchanged fields. However, PATCH requires more complicated backend delta validation logic.

### 22. "Your `/api/reports/:id/status` is a POST — shouldn't that be a GET?"
* **The Trick Question:** *An interviewer might say: "You are only fetching the status of a report. Why are you using POST instead of GET?"*
* **How to Defend It:**
  > *"Normally, retrieving data should be a **GET** request because GET is idempotent. However, in our system, checking the status of a report can trigger side-effects—for example, if the status is found to be stuck, the endpoint can initiate a self-healing retry pipeline. According to HTTP specs, GET requests must have **zero side-effects** and can be aggressively cached by browsers or CDNs. Since we want real-time, non-cached, dynamic updates that might trigger state repairs, **POST** is the safest, most robust choice."*

### 23. "How do you prevent a patient from accessing another patient's report?"
* **What we did:** We implement **resource ownership checking** in the database query.
* **Why:** In `reportController.js`, when a patient requests a report, we do not query just by `reportId`. We query by matching *both* the report ID and the patient's authenticated token ID:
  ```javascript
  const report = await Report.findOne({ _id: reportId, patientId: req.user.id });
  ```
  If Patient A tries to view Patient B's report, this query returns `null`, even if the report ID is technically correct.
* **Trade-off considered:** We could have fetched the report by ID first and then checked ownership in JS (`if (report.patientId !== req.user.id)`). This is a security risk because if a developer forgets that JS check, the document leaks. Putting the check directly into the database query makes it bulletproof.

### 24. "What happens if the AI extraction fails midway?"
* **What we did:** We wrapped our background worker in a global `try/catch` block.
* **Why:** If the Python OCR service fails, or Gemini throws a quota error, our code catches the exception, updates the report status in the database to `'failed'`, and logs the error safely. The server continues running normally, and the patient sees a clear "Processing Failed - Please upload a clearer copy" error on their dashboard instead of an infinite loading spinner.
* **Trade-off considered:** We could let the error bubble up. However, unhandled exceptions inside background tasks will crash the entire Node.js application process, logging out all other active patients.

---
*Created for interview preparation by Antigravity.*
