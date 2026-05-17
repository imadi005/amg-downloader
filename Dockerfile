FROM node:18-slim

RUN apt-get update && apt-get install -y \
    ffmpeg python3 curl unzip \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

# Install Deno
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Install yt-dlp-ejs from GitHub
RUN npm install -g github:yt-dlp/ejs || npm install -g https://github.com/yt-dlp/ejs || true

RUN yt-dlp --version && deno --version && ffmpeg -version | head -1

RUN mkdir -p /tmp/yt-dlp-downloads /app
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
