# DriveFlow — Document Manager

A full-stack document management web application built with Node.js, MySQL, and Google Drive API.

---

## Features

- 📁 Upload, organize, and manage files via Google Drive
- 🔐 JWT-based authentication with user and admin roles
- 📂 Create folders and organize files
- 🔍 Search, filter, and sort files
- 👁️ In-browser file preview (PDFs and images)
- ⬇️ Download files directly
- ✏️ Rename files
- 🔗 Share files via email
- 🗑️ Trash, restore, and permanently delete files
- 📊 Storage usage indicator
- 🌙 Light / dark theme toggle
- 📧 Contact form with email notifications (Nodemailer)
- 👤 Admin dashboard with user management

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | HTML, CSS, Vanilla JavaScript     |
| Backend   | Node.js, Express.js               |
| Database  | MySQL                             |
| Storage   | Google Drive API (service account)|
| Auth      | JWT, bcrypt                       |
| Email     | Nodemailer (Gmail)                |

---

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/driveflow.git
cd driveflow
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up MySQL
Run the following SQL to create the database and users table:
```sql
CREATE DATABASE IF NOT EXISTS document_manager;
USE document_manager;

CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    full_name   VARCHAR(100)         NOT NULL,
    email       VARCHAR(150)         NOT NULL UNIQUE,
    password    VARCHAR(255)         NOT NULL,
    role        ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at  TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Set up Google Drive API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable the **Google Drive API**
3. Create a **Service Account** and download the JSON key
4. Save the key as `google-drive-key.json` in the project root
5. Create a folder in your Google Drive and share it with the service account email (Editor access)
6. Copy the folder ID from the URL

### 5. Configure environment variables
Create a `.env` file in the project root:
```env
JWT_SECRET=your_jwt_secret_key
GOOGLE_DRIVE_FOLDER_ID=your_google_drive_folder_id
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=document_manager
CONTACT_EMAIL=your@gmail.com
CONTACT_EMAIL_PASS=your_gmail_app_password
```

> **Note:** `CONTACT_EMAIL_PASS` must be a [Gmail App Password](https://myaccount.google.com/apppasswords), not your regular Gmail password.

### 6. Run the server
```bash
node manager.js
```

### 7. Open the frontend
Open `index.html` with **Live Server** in VS Code (or any local server on port 5500/5501).

---

## Admin Access
To create an admin account, sign up with one of the whitelisted emails:
- `admin@example.com`
- `admin@documentmanager.com`

Or add your own email to the `allowedAdminEmails` array in `manager.js`.

---

## Project Structure
```
driveflow/
├── manager.js          # Express backend + all API routes
├── db.js               # MySQL connection module
├── index.html          # Landing page
├── about.html
├── features.html
├── how-it-works.html
├── contact.html
├── loginn.html         # Login page
├── loginn.js
├── loginn.css
├── signupp.html        # Sign up page
├── signupp.js
├── signupp.css
├── user_dashboard.html # User dashboard
├── user_dashboard.js
├── admin_dashboard.html# Admin dashboard
├── admin_dashboard.js
├── dashboard.css       # Dashboard styles
├── styles.css          # Main site styles
├── .env                # ← NOT committed (secrets)
├── google-drive-key.json # ← NOT committed (secrets)
└── .gitignore
```

---



## Author
**Mahitha Varanasi**  
[LinkedIn](https://www.linkedin.com/in/mahitha-varanasi/) · [Email](mailto:mahitha.varanasi2005@gmail.com)
