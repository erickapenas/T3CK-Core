# Dockerfile for Redis Sentinel
# Runs Redis Sentinel for HA failover management

FROM redis:7-alpine

# Install additional utilities
RUN apk add --no-cache bash curl

# Install health check script dependencies
RUN apk add --no-cache tini

# Create sentinel data directory
RUN mkdir -p /data && chmod 755 /data

# Copy sentinel configuration
COPY sentinel.conf /etc/redis/sentinel.conf

# Copy health check script
COPY scripts/health-check.sh /app/health-check.sh
RUN chmod +x /app/health-check.sh

# Expose Sentinel port
EXPOSE 26379

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD /app/health-check.sh

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start Sentinel
CMD ["redis-sentinel", "/etc/redis/sentinel.conf"]
