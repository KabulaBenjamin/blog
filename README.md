# Benjamin Koikoi — Personal Blog

A modern, SEO-optimised, AdSense-ready personal blog built with Node.js + Express + SQLite.

## ✨ Features

- **Editorial magazine design** — Navy/Teal/Gold aesthetic, Playfair Display typography
- **3 content modes** — paste as Markdown, HTML, or Plain Text
- **SEO-ready** — meta tags, Open Graph, Twitter Cards, JSON-LD structured data, sitemap.xml, robots.txt
- **AdSense-ready** — Privacy Policy, About, Contact pages; proper site structure
- **Google Analytics** — built-in GA4 support
- **Admin panel** — Create, edit, delete posts; manage settings; view contact messages
- **Live preview** — Preview your content before publishing
- **Image uploads** — Upload images directly in the editor
- **Reading progress bar** on article pages
- **Zero external database** — uses SQLite (single file, works on Render free tier)

---

## 🚀 Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start
npm run dev   # development (with auto-reload)
npm start     # production
```

Visit `http://localhost:3000`  
Admin panel: `http://localhost:3000/admin`  
Default password: **changeme123** — change this immediately in `/admin/settings`

---

## ☁️ Free Deployment on Render.com

Render gives you a **free Node.js web service** — perfect to start.

### Step-by-step:

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial blog setup"
   git remote add origin https://github.com/KabulaBenjamin/my-blog.git
   git push -u origin main
   ```

2. **Create Render account** → https://render.com

3. **New Web Service** → Connect your GitHub repo

4. **Configure:**
   | Setting | Value |
   |---------|-------|
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Plan | **Free** |

5. **Add environment variables** (Render Dashboard → Environment):
   ```
   NODE_ENV=production
   SESSION_SECRET=some-long-random-string
   BASE_URL=https://your-app.onrender.com
   DB_DIR=/var/data
   ```

6. **Add a Disk** (for SQLite persistence):
   - Go to your service → **Disks** → Add disk
   - Mount path: `/var/data`
   - Size: 1 GB (free)
   
   > ⚠️ Without the disk, your posts will be lost on every deploy restart. The disk keeps them safe.

7. **Deploy** → Render will build and deploy automatically.

### Free tier notes:
- Render free services **sleep after 15 minutes of inactivity** and take ~30s to wake up
- The 1GB disk is enough for years of blog posts and images
- When you're ready to upgrade, switch to the $7/month "Starter" plan for always-on

---

## 📝 Writing Posts

1. Go to `/admin` → Login
2. Click **+ New Post**
3. Choose your content mode:
   - **📝 Markdown** — Best for clean writing with formatting
   - **🌐 HTML** — Paste rich HTML content
   - **📄 Plain Text** — Just paste and go
4. Fill in title, excerpt, category, tags, meta description
5. Optionally upload a cover image
6. **Save Draft** or **Publish**

---

## 💰 Setting Up AdSense

Once approved by AdSense:

1. Go to `/admin/settings`
2. Enter your **AdSense Publisher ID** (e.g. `ca-pub-1234567890`)
3. Enter your **Ad Slot ID**
4. Save — ads will appear automatically on homepage and article pages

### AdSense review checklist:
- ✅ About page with author info
- ✅ Contact page with form
- ✅ Privacy Policy (automatically references AdSense and Analytics)
- ✅ Sitemap at `/sitemap.xml`
- ✅ Robots.txt at `/robots.txt`
- ✅ At least 15–20 quality articles before applying
- ✅ Custom domain (buy one for $10/year on Namecheap, point to Render)

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Templating | EJS |
| Database | SQLite (better-sqlite3) |
| Markdown | Marked.js |
| Sessions | express-session + SQLite store |
| Security | Helmet.js |
| Images | Multer |
| Fonts | Playfair Display, Source Serif 4 (Google Fonts) |

---

## 📁 Project Structure

```
blog/
├── server.js          # Entry point
├── models/db.js       # SQLite database setup
├── routes/
│   ├── blog.js        # Public routes (home, post, about, contact...)
│   └── admin.js       # Admin routes (CRUD, settings, uploads)
├── views/
│   ├── index.ejs      # Home page
│   ├── post.ejs       # Single post
│   ├── about.ejs      # About page
│   ├── contact.ejs    # Contact page
│   ├── privacy.ejs    # Privacy policy
│   ├── 404.ejs        # 404 page
│   ├── partials/      # Shared head, footer, post card
│   └── admin/         # Admin panel views
├── public/
│   ├── css/style.css  # All styles
│   ├── js/main.js     # Frontend JS
│   └── uploads/       # Uploaded images
└── data/              # SQLite database files (auto-created)
```

---

## 🛠️ Customisation

**Change blog title/tagline/about:** `/admin/settings`  
**Change password:** `/admin/settings` → Security section  
**Add Google Analytics:** paste your `G-XXXXXXX` ID in Settings  
**Custom domain on Render:** Dashboard → your service → Custom Domains

---

Made with ❤️ by Benjamin Kabula Koikoi — Evangelist · Developer · Author
