require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fileUpload = require("express-fileupload");
const { google } = require("googleapis");
const fs = require("fs");
const { Readable } = require("stream");
const nodemailer = require("nodemailer");
const multer = require('multer');
const app = express();
const PORT = 5000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const KEY_FILE_PATH = "./google-drive-key.json";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

app.use(express.json());
app.use(cors({
    origin: function(origin, callback) {
        const allowed = ['http://127.0.0.1:5500','http://127.0.0.1:5501','http://localhost:5500','http://localhost:5501','http://localhost:3000'];
        if (!origin || allowed.includes(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS','PUT','DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type']
}));
//app.use(fileUpload()); // ✅ Handles file uploads

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});
const drive = google.drive({ version: "v3", auth });

const PARENT_FOLDER_ID = (process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
const SECRET_KEY = (process.env.JWT_SECRET || "").trim();
const allowedAdminEmails = ["admin@example.com", "admin@documentmanager.com"];
if (!SECRET_KEY || !PARENT_FOLDER_ID) {
    console.error("\n❌ Missing environment variables:");
    if (!SECRET_KEY)        console.error("   - JWT_SECRET is not set");
    if (!PARENT_FOLDER_ID)  console.error("   - GOOGLE_DRIVE_FOLDER_ID is not set");
    console.error("Check your .env file.\n");
    process.exit(1);
}
const fs_check = require("fs");
if (!fs_check.existsSync(KEY_FILE_PATH)) {
    console.error("\n❌ google-drive-key.json not found at:", KEY_FILE_PATH);
    console.error("Make sure the file exists in your project root.\n");
    process.exit(1);
}
console.log("✅ All env vars loaded. PARENT_FOLDER_ID:", PARENT_FOLDER_ID);

// ── NODEMAILER TRANSPORTER ───────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.CONTACT_EMAIL,        // your Gmail address
        pass: process.env.CONTACT_EMAIL_PASS,   // Gmail App Password (not your real password)
    },
});

// Verify transporter on startup (non-fatal)
transporter.verify((err) => {
    if (err) console.warn("⚠️  Nodemailer not configured:", err.message);
    else     console.log("✅ Nodemailer ready — emails will send to", process.env.CONTACT_EMAIL);
});

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: 'document_manager',
});

db.connect(err => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to MySQL");
});
app.post("/signup", async (req, res) => {
    const { full_name, email, password, role } = req.body;
    if (role === "admin" && !allowedAdminEmails.includes(email)) {
        return res.status(403).json({ message: "You are not allowed to register as an admin!" });
    }

    // Hash the password before storing
    try{
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)";
    db.query(query, [full_name, email, hashedPassword, role], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ message: "Email already exists" });
            }
            console.error(err);
            return res.status(500).json({ message: "Signup failed" });
        }

        // Create user object
        const user = { id: result.insertId, full_name, email, role };

        // Generate JWT token
        const token = jwt.sign(user, SECRET_KEY, { expiresIn: "2h" });

        res.status(201).json({ message: "Signup successful!", user, token });
    });
}
catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
}   
});
app.post("/login", async (req, res) => {

    const { email, password } = req.body;

    const query = "SELECT * FROM users WHERE email = ?";
    db.query(query, [email], async (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Login failed" });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const user = results[0];

        // Compare hashed passwords
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
            SECRET_KEY,
            { expiresIn: "2h" }
        );

        res.status(200).json({ message: "Login successful!", token, role: user.role });
       
    });
});
// ✅ FIXED authenticateToken middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    console.log("Auth Header:", authHeader); // Debugging line

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    console.log("Extracted Token:", token); // Debugging line

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = user;
        next();
    });
}

async function getOrCreateUserFolder(userEmail) {
    if (!PARENT_FOLDER_ID || PARENT_FOLDER_ID.trim() === '') {
        throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set in your .env file");
    }
    try {
        const parentFolderId = PARENT_FOLDER_ID;
        console.log("Parent folder ID:", parentFolderId);
        console.log("Checking for folder for user:", userEmail);
        const response = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${userEmail}' and '${parentFolderId}' in parents and trashed=false`,
            fields: "files(id, name)",
        });
        console.log("Folder search response:", response); // Log the whole response
        console.log("Folder search response (files):", response.data.files);
        if (response.data.files.length > 0) {
            console.log(`Folder found for ${userEmail}:`, response.data.files[0]); // Log the whole object
            console.log(`Folder found for ${userEmail}:`, response.data.files[0].id);
            return response.data.files[0].id;
        } else {
            console.log(`Folder not found for ${userEmail}, creating one...`);

            const fileMetadata = {
                name: userEmail,
                mimeType: "application/vnd.google-apps.folder",
                parents: [parentFolderId],
            };
            console.log("File metadata for creation:", fileMetadata);

            const file = await drive.files.create({
                requestBody: fileMetadata,
                fields: "id",
            });
            console.log("Folder creation response:", file); // Log the whole response
            console.log(`Folder created for ${userEmail}:`, file.data); // Log the whole object
            console.log(`Folder created for ${userEmail}:`, file.data.id);
            return file.data.id;
        }
    } catch (error) {
        console.error("Error creating/checking folder:", error);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        throw error;
    }
    console.log("--- getOrCreateUserFolder END ---");
}

// 🔹 Convert Buffer to Readable Stream
const bufferToStream = (buffer) => {
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    return readable;
};

// ✅ Fixed: File Upload Route (without multer)
app.post("/upload", (req, res, next) => {
    console.log("--- /upload route hit ---");
    console.log("Incoming request to /upload");
    console.log("Content-Type:", req.headers["content-type"]);
    console.log("Request Headers:", req.headers);
    next();
}, authenticateToken, upload.single('file'), async (req, res) => {
    console.log("req.file after multer:", req.file);
    if (!req.file) {
        return res.status(400).send("No files were uploaded.");
    }

    const uploadedFile = req.file;
    const maxSize = 10 * 1024 * 1024; // 10 MB (adjust as needed)

    if (uploadedFile.size > maxSize) {
        return res.status(413).send("File size exceeds the limit of 10 MB."); // 413 Payload Too Large
    }
    try {
        console.log("User email:", req.user.email);
        const userFolderId = await getOrCreateUserFolder(req.user.email);
        console.log("Generated User Folder ID:", userFolderId);
        if (!userFolderId) {
            return res.status(500).json({ message: "Error getting user folder ID" });
        }

        const folderId = req.body.folderId;
        const fileMetadata = {
            name: req.file.originalname,
            parents: folderId ? [folderId] : [userFolderId],
        };
        console.log("fileMetadata.parents:", fileMetadata.parents);
        const media = {
            mimeType: req.file.mimetype,
            body: bufferToStream(req.file.buffer),
        };

        console.log("Google Drive upload metadata:", fileMetadata);
        console.log("Google Drive media:", media);

        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id, webViewLink",
        });

        console.log("Google Drive upload response:", file); // Log the whole response

        if (!file.data.id) {
            console.error("File Upload Failed: No ID returned.");
            return res.status(500).json({ message: "Google Drive upload failed." });
        }

        console.log("Uploaded File ID:", file.data.id);
        const publicLink = await setFilePublic(file.data.id);
        console.log("Public link:", publicLink);

        res.json({
            message: "File uploaded successfully",
            fileId: file.data.id,
            fileLink: publicLink,
        });

    } catch (error) {
        console.error("Upload Error:", error);
        console.error("Upload Error message:", error.message);
        console.error("Upload Error stack:", error.stack);
        res.status(500).json({ message: "File upload failed" });
    }
    console.log("--- /upload route end ---");
});
app.post("/test-upload", upload.single('file'), (req, res) => {
    console.log("req.file in test-upload:", req.file);
    if (req.file) {
        res.send("File uploaded successfully (test route)");
    } else {
        res.send("File upload failed (test route)");
    }
});


async function setFilePublic(fileId) {

    await drive.permissions.create({
        fileId: fileId,
        requestBody: {
            role: "reader",
            type: "anyone",
        },
    });

    const { data } = await drive.files.get({
        fileId: fileId,
        fields: "id, webViewLink",
    });
    return data.webViewLink; // Return the updated public link
}

// ✅ Fixed: Fetch Documents from Google Drive
app.get("/documents", authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log("Fetching documents for:", userEmail);
        const userFolderId = await getOrCreateUserFolder(userEmail); // Ensure we get the correct folder
        console.log(`User folder ID: ${userFolderId}`);
        if (!userFolderId) {
            return res.status(500).json({ message: "User folder not found" });
        }

        const response = await drive.files.list({
            q: `'${userFolderId}' in parents and trashed=false`,
            fields: "files(id, name, webViewLink, parents)",
        });

        console.log("Fetched Files from Drive:", response.data.files);
        res.json({ documents: response.data.files });

    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({ message: "Failed to retrieve documents", error: error.message  });
    }
});

app.get("/admin-data", authenticateToken, (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access forbidden" });
    }
    res.json({ message: "Welcome Admin!" });
});
app.get("/users", authenticateToken, (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access forbidden" });
    }

    db.query("SELECT id, full_name, email, role FROM users", (err, results) => {
        if (err) {
            return res.status(500).json({ message: "Error fetching users" });
        }
        res.json(results);
    });
});
app.get("/list-files", authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const userFolderId = await getOrCreateUserFolder(userEmail);
        if (!userFolderId) {
            console.error("User folder not found!");
            return res.status(404).json({ message: "User folder not found." });
        }
        console.log("User Folder ID:", userFolderId);

        let query = `'${userFolderId}' in parents and trashed=false`;

        if (req.query.folderId) {
            query = `'${req.query.folderId}' in parents and trashed=false`;
        }

        const response = await drive.files.list({
            q: query,
            fields: "files(id, name, webViewLink, size, mimeType)",
        });
        console.log("Google Drive response:", response);
        console.log("Files List:", response.data.files);

        if (!response.data.files || !response.data.files.length) {
            return res.json({ files: [] });
        }

        res.json({ files: response.data.files });
    } catch (error) {
        console.error("Error fetching files:", error);
        res.status(500).json({ message: "Failed to retrieve files", error: error.message });
    }
});
app.delete("/delete-file/:fileId", authenticateToken, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        console.log("Backend received fileId:", fileId);

        // Fetch file details from Google Drive to get the parent folder.
        const fileDetails = await drive.files.get({
            fileId: fileId,
            fields: 'parents',
        });

        const parentFolder = fileDetails.data.parents && fileDetails.data.parents[0];

        // Move file to trash in Google Drive
        await drive.files.update({
            fileId: fileId,
            requestBody: { trashed: true, appProperties: { originalParent: parentFolder } },
        });

        res.send("File moved to trash.");
    } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).send("Error deleting file.");
    }
});
app.get("/trash", authenticateToken, async (req, res) => {
    try {
        const response = await drive.files.list({
            q: "trashed=true",
            fields: "files(id, name, modifiedTime, appProperties)",
        });

        res.json(response.data.files);
    } catch (error) {
        console.error("Error fetching trash:", error);
        res.status(500).send("Error fetching trash.");
    }
});
app.put("/restore-file/:fileId", authenticateToken, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        console.log("Restore request for fileId:", fileId);

        const fileData = await drive.files.get({
            fileId: fileId,
            fields: 'appProperties, parents'
        });

        const originalParent = fileData.data.appProperties.originalParent;
        const currentParents = fileData.data.parents;

        console.log("Original parent folder:", originalParent);
        console.log("Current parent folders: ", currentParents);

        // Restore file in Google Drive
        await drive.files.update({
            fileId: fileId,
            addParents: originalParent,
            removeParents: currentParents[0],
            requestBody: { trashed: false, appProperties: null },
        });

        console.log("File restored in Google Drive");

        res.send("File restored successfully."); 
        console.log("restore success response sent");

    } catch (error) {
        console.error("Error restoring file:", error);
        res.status(500).send("Error restoring file.");
    }
});
app.delete("/permanent-delete/:fileId", authenticateToken, async (req, res) => {
    try {
        const fileId = req.params.fileId;

        // Delete file from Google Drive
        await drive.files.delete({ fileId: fileId });

        res.send("File permanently deleted.");
    } catch (error) {
        console.error("Error permanently deleting file:", error);
        res.status(500).send("Error permanently deleting file.");
    }
});
app.get("/download-file/:fileId", authenticateToken, async (req, res) => {
    try {
        console.log("Request Headers:", req.headers);
        const fileId = req.params.fileId;
        const file = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' });

        // Set the Content-Type header based on the file type
        const fileMetadata = await drive.files.get({ fileId: fileId, fields: 'mimeType' });
        const mimeType = fileMetadata.data.mimeType;

        console.log("MIME Type:", mimeType);
        res.setHeader('Content-Type', mimeType);

        console.log("Headers:", res.getHeaders());
        res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
        file.data.pipe(res);
        console.log("File data streamed successfully"); // Add this line

    } catch (error) {
        console.error("Error downloading file:", error);
        res.status(500).send("Error downloading file.");
    }
});
app.post("/share-file/:fileId", authenticateToken, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const email = req.body.email;

        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: "reader", // Adjust role as needed (reader, writer, etc.)
                type: "user",
                emailAddress: email,
            },
        });

        res.send("File shared successfully.");
    } catch (error) {
        console.error("Error sharing file:", error);
        res.status(500).send("Error sharing file.");
    }
});
async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-drive-key.json', // Replace with your service account key file path
        scopes: ['https://www.googleapis.com/auth/drive'], // Or ['https://www.googleapis.com/auth/drive']
    });
    const client = await auth.getClient();
    return google.drive({ version: 'v3', auth: client });
}
app.post("/create-folder", authenticateToken, async (req, res) => {
    try {
        const folderName = req.body.folderName;
        const userEmail = req.user.email;
        const userFolderId = await getOrCreateUserFolder(userEmail); // Get user's folder ID

        if (!userFolderId) {
            return res.status(500).send("User folder not found.");
        }

        const driveClient = await getDriveClient();

        const folder = await driveClient.files.create({
            requestBody: {
                name: folderName,
                mimeType: "application/vnd.google-apps.folder",
                parents: [userFolderId], // Use user's folder ID as parent
            },
        });
        console.log("Google Drive API Response:", folder.data);
        res.send({ folderId: folder.data.id });
    } catch (error) {
        console.error("Error creating folder:", error);
        res.status(500).send("Error creating folder.");
    }
});

// ── DIAGNOSTIC ROUTE: GET http://localhost:5000/test-drive ──
// Open this in your browser while server is running to check Drive connection
app.get("/test-drive", async (req, res) => {
    const results = {};
    results.env_folder_id = process.env.GOOGLE_DRIVE_FOLDER_ID || "❌ NOT SET";
    results.env_jwt = process.env.JWT_SECRET ? "✅ set" : "❌ NOT SET";
    results.key_file_exists = require("fs").existsSync("./google-drive-key.json");

    if (!results.key_file_exists) {
        return res.json({ ...results, error: "google-drive-key.json not found" });
    }
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
        return res.json({ ...results, error: "GOOGLE_DRIVE_FOLDER_ID not set in .env" });
    }

    try {
        // Test 1: Can we access Drive at all?
        const about = await drive.about.get({ fields: "user" });
        results.drive_connected = true;
        results.service_account_email = about.data.user.emailAddress;

        // Test 2: Can we access the parent folder?
        const folder = await drive.files.get({
            fileId: process.env.GOOGLE_DRIVE_FOLDER_ID,
            fields: "id, name, mimeType"
        });
        results.parent_folder_found = true;
        results.parent_folder_name = folder.data.name;
        results.status = "✅ Everything looks good!";
    } catch (err) {
        results.drive_connected = false;
        results.error = err.message;
        if (err.message.includes("File not found")) {
            results.fix = "The folder ID in .env is wrong OR the service account has not been shared on that folder.";
        } else if (err.message.includes("invalid_grant") || err.message.includes("credentials")) {
            results.fix = "google-drive-key.json is invalid or expired. Re-download from Google Cloud Console.";
        }
    }
    res.json(results);
});


// ── RENAME FILE ──────────────────────────────────────────────────
app.put("/rename-file/:fileId", authenticateToken, async (req, res) => {
    try {
        const { newName } = req.body;
        if (!newName || !newName.trim()) {
            return res.status(400).json({ message: "New name is required." });
        }
        await drive.files.update({
            fileId: req.params.fileId,
            requestBody: { name: newName.trim() },
        });
        res.json({ message: "File renamed successfully." });
    } catch (error) {
        console.error("Error renaming file:", error);
        res.status(500).json({ message: "Failed to rename file." });
    }
});

// ── STORAGE USAGE ────────────────────────────────────────────────
app.get("/storage-usage", authenticateToken, async (req, res) => {
    try {
        const userFolderId = await getOrCreateUserFolder(req.user.email);
        const response = await drive.files.list({
            q: `'${userFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
            fields: "files(id, size)",
        });
        const files = response.data.files || [];
        const totalBytes = files.reduce((sum, f) => sum + (parseInt(f.size) || 0), 0);
        const fileCount = files.length;
        res.json({ totalBytes, fileCount, limitBytes: 10 * 1024 * 1024 * 1024 }); // 10GB limit
    } catch (error) {
        console.error("Error fetching storage usage:", error);
        res.status(500).json({ message: "Failed to fetch storage usage." });
    }
});

// ── ADMIN: DELETE USER ───────────────────────────────────────────
app.delete("/users/:userId", authenticateToken, (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access forbidden." });
    }
    const userId = req.params.userId;
    // Prevent admin from deleting themselves
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account." });
    }
    db.query("DELETE FROM users WHERE id = ?", [userId], (err, result) => {
        if (err) {
            console.error("Error deleting user:", err);
            return res.status(500).json({ message: "Failed to delete user." });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        res.json({ message: "User deleted successfully." });
    });
});

// ── FORGOT PASSWORD (reset via email - sends temp password) ──────
app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ message: "Server error." });
        // Always return success to prevent email enumeration
        if (results.length === 0) {
            return res.json({ message: "If that email exists, a reset link has been sent." });
        }
        const user = results[0];
        // Generate a reset token (valid 1 hour)
        const resetToken = jwt.sign({ id: user.id, email: user.email, purpose: "reset" }, SECRET_KEY, { expiresIn: "1h" });
        // In production: send email with reset link containing token
        // For now: return token directly (attach to email in production)
        console.log("Password reset token for", email, ":", resetToken);
        res.json({ message: "If that email exists, a reset link has been sent.", resetToken }); // remove resetToken in production
    });
});

// ── RESET PASSWORD ───────────────────────────────────────────────
app.post("/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required." });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.purpose !== "reset") {
            return res.status(400).json({ message: "Invalid reset token." });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, decoded.id], (err) => {
            if (err) return res.status(500).json({ message: "Failed to reset password." });
            res.json({ message: "Password reset successfully. You can now log in." });
        });
    } catch (err) {
        res.status(400).json({ message: "Reset token is invalid or expired." });
    }
});


// ── CONTACT FORM ─────────────────────────────────────────────────
app.post("/contact", async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: "All fields are required." });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address." });
    }

    if (message.trim().length < 10) {
        return res.status(400).json({ message: "Message is too short." });
    }

    try {
        await transporter.sendMail({
            from: `"DriveFlow Contact" <${process.env.CONTACT_EMAIL}>`,
            to:   process.env.CONTACT_EMAIL,   // sends to yourself
            replyTo: email,                    // so you can reply directly to sender
            subject: `New message from ${name} via DriveFlow`,
            html: `
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f5f5f5;padding:24px;border-radius:12px;">
                    <h2 style="color:#4f46e5;margin-top:0;">New Contact Message</h2>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr>
                            <td style="padding:8px 0;color:#666;width:80px;"><strong>Name</strong></td>
                            <td style="padding:8px 0;color:#111;">${name}</td>
                        </tr>
                        <tr>
                            <td style="padding:8px 0;color:#666;"><strong>Email</strong></td>
                            <td style="padding:8px 0;"><a href="mailto:${email}" style="color:#4f46e5;">${email}</a></td>
                        </tr>
                    </table>
                    <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;">
                    <p style="color:#666;margin:0 0 8px;"><strong>Message:</strong></p>
                    <p style="color:#111;background:white;padding:16px;border-radius:8px;line-height:1.6;margin:0;">${message.replace(/\n/g, "<br>")}</p>
                    <p style="color:#999;font-size:12px;margin-top:16px;">Sent via DriveFlow contact form</p>
                </div>
            `,
        });

        res.json({ message: "Message sent! We'll get back to you soon." });
    } catch (error) {
        console.error("Email send error:", error.message);
        res.status(500).json({ message: "Failed to send message. Please try again later." });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});