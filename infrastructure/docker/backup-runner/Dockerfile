FROM google/cloud-sdk:slim

# Install redis-tools and awscli
RUN apt-get update && \
    apt-get install -y --no-install-recommends redis-tools curl unzip ca-certificates python3 python3-pip gnupg && \
    pip3 install --no-cache-dir awscli && \
    rm -rf /var/lib/apt/lists/*

# Create app dir
WORKDIR /opt/backup-runner

# Copy entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV FIRESTORE_EXPORT_PREFIX="firestore-backups"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
