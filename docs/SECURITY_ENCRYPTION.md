# 🔐 Security & Data Protection

This document defines data security practices for T3CK Core, covering retention, backups, disaster recovery, GDPR compliance, and data classification.

## 🗃️ Data Retention Policy

- **Operational data**: 24 months by default.
- **Audit logs**: 90 days hot storage, archived for 12 months.
- **Backups**: 365 days (S3 lifecycle policy).
- **Temporary data**: 7 days (sessions, caches).

Retention is enforced through:
- S3 lifecycle policies for backup artifacts.
- Redis TTL for session and token data.
- Database retention windows via scheduled cleanup jobs (to be scheduled per service).

## 🧯 Backup Security

- **S3 backups bucket**: versioning enabled, SSE-S3 encryption enforced.
- **Public access**: blocked for all storage buckets.
- **TLS enforcement**: S3 bucket policy denies insecure transport.
- **Access control**: backup write access restricted to CI/CD roles and backup jobs.

## 🧭 Disaster Recovery

- **RDS Multi-AZ** enabled for high availability.
- **Automated backups** with point-in-time recovery (RDS).
- **Redis Multi-AZ** with automatic failover.
- **S3 backup retention** for recovery and forensic analysis.

## 📜 GDPR Compliance

- **Right to access**: export endpoints supported via internal tooling.
- **Right to erasure**: anonymization workflows available per service.
- **Data minimization**: sensitive fields encrypted, least-privilege access.
- **Auditability**: access and changes logged via CloudWatch and audit logs.

## 🧭 Data Classification

- **Public**: marketing content, public catalog metadata.
- **Internal**: operational metrics, non-sensitive configuration.
- **Confidential**: user profiles, tenant data, non-public pricing.
- **Restricted**: authentication secrets, payment tokens, encrypted PII.

Classifications are used to:
- Define retention and backup requirements.
- Determine encryption and access controls.
- Apply stricter monitoring and alerting.

## 🔐 Encryption Standards

- **At rest**: AES-256 (S3, RDS, Redis, Secrets Manager).
- **In transit**: TLS 1.2+ enforced for internal and external traffic.
- **Key rotation**: JWT and secret rotation supported via key manager and AWS Secrets Manager.
