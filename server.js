const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = '/tmp/yt-dlp-downloads';
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static('public'));

const jobs = new Map();

// ── Start Download ───────────────────────────────────────────────────────────
app.post('/api/start', (req, res) => {
  const { url, format } = req.body;

  const isYouTube = url && (url.includes('youtube.com') || url.includes('youtu.be'));
  if (!url || !isYouTube) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  const jobId = uuidv4();
  const outputTemplate = path.join(DOWNLOAD_DIR, `${jobId}_%(title)s.%(ext)s`);

  // Base flags: fix JS runtime + bypass bot detection
  const cookiesFile = '/app/cookies.txt';
  const cookiesArgs = fs.existsSync(cookiesFile) ? ['--cookies', cookiesFile] : [];
  const baseArgs = [
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=android,web',
    '--no-check-certificates',
    ...cookiesArgs
  ];

  let args;
  if (format === 'audio') {
    args = [
      ...baseArgs,
      '-x', '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--embed-metadata',
      '-o', outputTemplate,
      url
    ];
  } else {
    args = [
      ...baseArgs,
      '-f', 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/best',
      '--merge-output-format', 'mp4',
      '--postprocessor-args', 'ffmpeg:-c:a aac',
      '--embed-metadata',
      '--embed-thumbnail',
      '-o', outputTemplate,
      url
    ];
  }

  const job = {
    id: jobId,
    status: 'starting',
    progress: 0,
    speed: '',
    eta: '',
    title: '',
    filename: null,
    filepath: null,
    error: null,
    clients: []
  };

  jobs.set(jobId, job);

  // ── Spawn yt-dlp ──────────────────────────────────────────────────────────
  const proc = spawn(YTDLP, args);

  const parseOutput = (text) => {
    console.log('[yt-dlp]', text.trim());

    // Title
    const titleMatch = text.match(/\[info\] (.+): Downloading/);
    if (titleMatch) {
      job.title = titleMatch[1];
    }

    // Progress line: [download]  67.3% of 234.56MiB at  3.20MiB/s ETA 00:45
    const progressMatch = text.match(/(\d+\.?\d*)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s)\s+ETA\s+(\S+)/);
    if (progressMatch) {
      job.progress = parseFloat(progressMatch[1]);
      job.speed = progressMatch[2];
      job.eta = progressMatch[3];
      job.status = 'downloading';
      broadcast(job, {
        type: 'progress',
        progress: job.progress,
        speed: job.speed,
        eta: job.eta
      });
    }

    // Merging
    if (text.includes('[Merger]') || text.includes('Merging')) {
      job.status = 'merging';
      job.progress = 99;
      broadcast(job, { type: 'progress', progress: 99, speed: '', eta: 'Merging...' });
    }

    // Post processing
    if (text.includes('[EmbedThumbnail]') || text.includes('[Metadata]')) {
      broadcast(job, { type: 'progress', progress: 99, speed: '', eta: 'Finalizing...' });
    }
  };

  proc.stdout.on('data', (data) => parseOutput(data.toString()));
  proc.stderr.on('data', (data) => parseOutput(data.toString()));

  proc.on('close', (code) => {
    if (code === 0) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(
        f => f.startsWith(jobId) && !f.endsWith('.part') && !f.endsWith('.ytdl')
      );
      if (files.length > 0) {
        const finalFile = files[0];
        job.filename = finalFile.replace(`${jobId}_`, '');
        job.filepath = path.join(DOWNLOAD_DIR, finalFile);
        job.status = 'done';
        job.progress = 100;
        broadcast(job, { type: 'done', filename: job.filename, jobId });
      } else {
        job.status = 'error';
        broadcast(job, { type: 'error', message: 'File not found after download.' });
      }
    } else {
      job.status = 'error';
      broadcast(job, { type: 'error', message: 'Download failed. Check the URL and try again.' });
    }
  });

  res.json({ jobId });
});

// ── SSE Progress ─────────────────────────────────────────────────────────────
app.get('/api/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).send('Job not found');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  if (job.status === 'done') {
    res.write(`data: ${JSON.stringify({ type: 'done', filename: job.filename, jobId: job.id })}\n\n`);
    return res.end();
  }
  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', message: job.error })}\n\n`);
    return res.end();
  }

  job.clients.push(res);
  req.on('close', () => {
    job.clients = job.clients.filter(c => c !== res);
  });
});

// ── Serve File ───────────────────────────────────────────────────────────────
app.get('/api/file/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.filepath) return res.status(404).send('File not found');

  res.download(job.filepath, job.filename, (err) => {
    if (!err) {
      setTimeout(() => {
        try { fs.unlinkSync(job.filepath); } catch (_) {}
        jobs.delete(job.id);
      }, 10000);
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function broadcast(job, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  job.clients.forEach(client => {
    client.write(payload);
    if (data.type === 'done' || data.type === 'error') client.end();
  });
  if (data.type === 'done' || data.type === 'error') {
    job.clients = [];
  }
}

// ── Cleanup old files every hour ─────────────────────────────────────────────
setInterval(() => {
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR);
    const now = Date.now();
    files.forEach(f => {
      const fp = path.join(DOWNLOAD_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 3600000) fs.unlinkSync(fp);
    });
  } catch (_) {}
}, 3600000);

app.listen(PORT, () => console.log(`AMG Downloader running on port ${PORT}`));
