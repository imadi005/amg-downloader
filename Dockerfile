FROM node:18-slim

# Install system deps
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Install Deno (yt-dlp's preferred JS runtime for n-challenge)
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Install yt-dlp-ejs from GitHub
RUN npm install -g github:yt-dlp/ejs || true

# Verify
RUN yt-dlp --version && deno --version && node --version && ffmpeg -version | head -1

RUN mkdir -p /tmp/yt-dlp-downloads /app

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
