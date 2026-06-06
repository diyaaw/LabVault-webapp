const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary from environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage engine for pathology/patient reports → uploads to reports/ folder
const reportStorage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
        const isPdf = file.mimetype === 'application/pdf';
        const ext = path.extname(file.originalname).toLowerCase(); // e.g. '.pdf', '.jpg'
        const baseName = path.parse(file.originalname).name;
        return {
            folder: 'reports',
            resource_type: isPdf ? 'raw' : 'auto',
            // Include extension for PDFs so Cloudinary serves the correct MIME type
            public_id: `report-${Date.now()}-${baseName}${isPdf ? ext : ''}`,
            format: isPdf ? undefined : undefined, // let Cloudinary infer for images
        };
    },
});

// Storage engine for doctor/pathology certificates → saves to local uploads/certificates/
const certificateStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/certificates/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `cert-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
    },
});

// Allow JPEG, JPG, PNG, PDF only
const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Images and PDFs only!'));
    }
};

// 10 MB limit for reports
const upload = multer({
    storage: reportStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
});

// 5 MB limit for certificates (local disk — admin-only verification files)
const uploadCertificate = multer({
    storage: certificateStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter,
});

module.exports = { upload, uploadCertificate };
