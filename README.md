# 🏡 Connelly Family Calendar — Setup Guide

Everything you need to get `connellyfamily.org` showing your family calendar.

---

## Overview of what you're building

```
connellyfamily.org  →  GoDaddy DNS  →  GitHub Pages  →  your calendar site
```

The site is a single HTML page that:
- Shows a password prompt
- Fetches events from your public Google Calendars
- Renders a monthly grid with color-coded events

---

## Step 1 — Create a GitHub account & repository

1. Go to [github.com](https://github.com) and create a free account (or log in).
2. Click **New repository**.
3. Name it exactly: `connellyfamily.org`
4. Set it to **Public** (required for free GitHub Pages).
5. Click **Create repository**.

---

## Step 2 — Upload the site files

In your new repository, upload these files keeping the folder structure:

```
connellyfamily.org/
├── index.html
├── config.js          ← you'll edit this
├── css/
│   └── style.css
└── js/
    └── app.js
```

To upload: click **Add file → Upload files** in GitHub, then drag and drop.

---

## Step 3 — Enable GitHub Pages

1. In your repository, go to **Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Choose branch: `main`, folder: `/ (root)`.
4. Click **Save**.

GitHub will give you a URL like `https://yourusername.github.io/connellyfamily.org` — verify the site loads there before continuing.

---

## Step 4 — Point your GoDaddy domain to GitHub Pages

### In GitHub (do this first):
1. Go to **Settings → Pages → Custom domain**.
2. Type `connellyfamily.org` and click **Save**.
3. GitHub will create a `CNAME` file in your repo automatically.

### In GoDaddy DNS:
1. Log into GoDaddy → **My Products → Domains → connellyfamily.org → Manage DNS**.
2. **Delete** any existing A records pointing to GoDaddy's default IP.
3. **Add 4 new A records** pointing to GitHub Pages:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 185.199.108.153 | 600 |
| A | @ | 185.199.109.153 | 600 |
| A | @ | 185.199.110.153 | 600 |
| A | @ | 185.199.111.153 | 600 |

4. **Add a CNAME record** for www:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | www | yourusername.github.io | 600 |

DNS changes can take up to 48 hours but usually finish in under an hour.

5. Back in GitHub Pages settings, check **Enforce HTTPS** once the domain verifies.

---

## Step 5 — Make your Google Calendars public

For each calendar (Family, Kirt, Work):

1. Open [calendar.google.com](https://calendar.google.com).
2. In the left sidebar, hover over the calendar name → click the **⋮ menu → Settings and sharing**.
3. Under **Access permissions for events**, check **Make available to public**.
4. Click **OK** on the warning (events will be visible to anyone with the calendar ID).
5. Scroll down to **Integrate calendar**.
6. Copy the **Calendar ID** — it looks like one of these:
   - Your personal calendar: `yourname@gmail.com`
   - A shared calendar: `abc123xyz@group.calendar.google.com`

---

## Step 6 — Get a Google Calendar API key (free)

The site uses Google's Calendar API to fetch events. You need a free API key:

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (call it "Family Calendar").
3. Go to **APIs & Services → Library**.
4. Search for **Google Calendar API** and click **Enable**.
5. Go to **APIs & Services → Credentials → Create Credentials → API key**.
6. Copy the key.
7. Click **Edit** on the key → under **API restrictions**, select **Restrict key** → choose **Google Calendar API**.
8. Under **Application restrictions**, choose **HTTP referrers** and add:
   - `connellyfamily.org/*`
   - `www.connellyfamily.org/*`
   - `yourusername.github.io/*` (for testing)

This key is safe to put in a public website because it's restricted to your domain and only works on the read-only Calendar API.

---

## Step 7 — Edit config.js

Open `config.js` and fill in your values:

### Set your password hash

1. Go to: https://emn178.github.io/online-tools/sha256.html
2. Type your chosen family password (e.g. `connelly2026`).
3. Copy the long hash that appears.
4. Paste it as `passwordHash` in `config.js`.

### Add your Calendar IDs

Paste each calendar's ID into the `id` field:

```js
calendars: [
  {
    name: "Family",
    color: "#639922",
    bgColor: "#c0dd97",
    textColor: "#27500a",
    id: "abc123@group.calendar.google.com"  // ← paste here
  },
  // ...
]
```

### Add your API key

In `js/app.js`, find this line:

```js
+ `?key=AIzaSyD-PLACEHOLDER`
```

Replace `AIzaSyD-PLACEHOLDER` with your actual API key.

---

## Step 8 — Commit and test

1. Save all your file changes.
2. Upload/commit the updated files to GitHub.
3. Wait 1–2 minutes for GitHub Pages to rebuild.
4. Visit `connellyfamily.org`, enter your password, and verify events appear.

---

## Troubleshooting

**Events not loading?**
- Make sure each calendar is set to **public** in Google Calendar settings.
- Double-check the Calendar ID is copied exactly.
- Check the browser console (F12) for error messages — a 403 usually means the API key isn't set up correctly.

**Wrong password every time?**
- Make sure you hashed the password correctly at the SHA-256 tool.
- Copy the full 64-character hash with no extra spaces.

**Domain not pointing to GitHub?**
- DNS changes can take up to 48 hours.
- Use [whatsmydns.net](https://whatsmydns.net) to check propagation status.

**Calendar shows but is empty?**
- Confirm the time zone on your Google Calendar matches your local time.
- Try navigating to the current month using the **Today** button.

---

## Adding or changing calendars later

Just edit `config.js` — add a new object to the `calendars` array or change a color, and commit the file. The site updates automatically within a couple minutes.

---

## Security note

The password is stored as a SHA-256 hash in a public file. This is appropriate for a low-stakes family site — it prevents casual visitors from seeing your events. For higher security, you'd need a server-side solution. The calendars themselves are also public on Google, so anyone who discovers a calendar ID directly can view events. This setup is "security by obscurity" — fine for a family calendar, not for sensitive data.

---

*Built for the Connelly family — connellyfamily.org*
