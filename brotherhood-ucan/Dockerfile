FROM node:20-alpine

# Use apk instead of apt-get for Alpine-based Node images
RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

ENV PORT=3000

CMD ["./node_modules/.bin/tsx", "server.ts"]
