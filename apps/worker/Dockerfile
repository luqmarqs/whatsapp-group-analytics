FROM node:20-alpine AS builder
WORKDIR /app
# native deps for Baileys (libvips etc. not needed — baileys uses pure JS)
RUN apk add --no-cache python3 make g++ git
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++ git
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
VOLUME ["/app/sessions"]
CMD ["node", "dist/index.js"]
