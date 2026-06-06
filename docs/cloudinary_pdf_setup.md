# 🌐 Resolving Cloudinary PDF Loading Issues

If you see **"Failed to load PDF document"** in your LabVault dashboard, the underlying cause is an account-level security restriction on your Cloudinary account. 

By default, newer and free-tier Cloudinary accounts **block the delivery/rendering of PDF and ZIP files** to prevent potential security threats (such as malware distribution). When the application attempts to load your report PDF inside an `<iframe>`, Cloudinary blocks the request with a `401 Unauthorized` and the header `x-cld-error: deny or ACL failure`.

---

## 🛠️ Step-by-Step Fix: Enabling PDF Delivery in Cloudinary

To allow your LabVault application to render and preview PDF reports, you must toggle the PDF delivery permission in your Cloudinary Console.

### 1. Log In to Cloudinary
Go to [Cloudinary Console](https://cloudinary.com/console) and log in with your credentials.

### 2. Navigate to Settings
Click the **Gear Icon (Settings)** at the bottom-left corner of the sidebar panel.

### 3. Open Security Settings
In the settings page, select **Security** from the submenu under *Product Environments*.

### 4. Enable PDF & ZIP Delivery
Scroll down to the section titled **PDF and ZIP files delivery** or **Restricted Media Types**.
* Check the box or toggle the switch for **"Allow delivery of PDF and ZIP files"**.

### 5. Save Changes
Click **Save** at the bottom of the page to apply the new security policy.

---

## ⚠️ Crucial Next Steps (Caching & Propagation)

Once you save the changes, the new security rule applies instantly on Cloudinary, but **previous errors might still be cached by your browser or Cloudinary's CDN**. 

To immediately verify the fix:
1. **Open an Incognito/Private window** or use a different browser.
2. Log into your LabVault application.
3. Click on the report. The PDF will now render perfectly inline inside the viewer!

---

> [!NOTE]
> The backend code is fully prepared to handle the absolute Cloudinary URLs. Once this toggle is enabled in your Cloudinary Console, the PDFs will stream directly into the dashboards with proper headers.
