FROM python:3.11-alpine

# Install curl via alpine package manager
RUN apk add curl
RUN apk add curl jq

# Set the working directory
WORKDIR /nostr-relay

# Copy and install backend dependencies
COPY . .
RUN pip install --upgrade pip
RUN pip install --default-timeout=100 -r requirements.txt

EXPOSE 10000

# Start both services
CMD ["/bin/sh", "/nostr-relay/app/start-services.sh"]
