# AMG Downloader — Internal Tool

YouTube downloader for AMG Productions team. Downloads Premiere-ready H.264 + AAC MP4s.

## Deploy to Railway (5 steps)

1. Push this folder to a **private GitHub repo**
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Go to **Variables** tab → Add:
   ```
   PASSWORD = your_team_password_here
   ```
5. Railway auto-builds using the Dockerfile → your URL is live

## Local Development

```bash
npm install
node server.js
# Open http://localhost:3000
```

> For local dev, make sure `yt-dlp` and `ffmpeg` are installed on your machine and in PATH.

## Features

- H.264 + AAC output — no AV1 issues in Premiere
- Real-time progress bar
- Password protected
- Auto file cleanup after download
- MP4 video or MP3 audio toggle

## Change Password

Set the `PASSWORD` environment variable in Railway dashboard.  
Default: `amg2024`
