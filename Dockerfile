FROM node:18-slim

# Install system deps
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Pre-fetch yt-dlp-ejs component from GitHub at build time
RUN yt-dlp --allow-unplayable-formats --remote-components ejs:github -v --simulate "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 || true

# Verify installs
RUN yt-dlp --version && ffmpeg -version | head -1 && node --version

RUN mkdir -p /tmp/yt-dlp-downloads /app

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
