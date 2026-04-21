#!/bin/bash

# T3CK Core - AWS to Cloud Run Migration Script
# This script automates the migration from AWS Terraform backend/provider to GCP

set -e  # Exit on error

echo "============================================"
echo "T3CK Core - AWS to GCP Migration Script"
echo "============================================"
echo ""

# Configuration
GCP_PROJECT_ID="${GCP_PROJECT_ID:-t3ck-core-prod}"
GCP_REGION="${GCP_REGION:-us-central1}"
TERRAFORM_STATE_BUCKET="${GCP_PROJECT_ID}-terraform-state"
KMS_KEYRING="${GCP_PROJECT_ID}-terraform-keyring"
KMS_KEY="${GCP_PROJECT_ID}-terraform-state-key"

echo "Configuration:"
echo "GCP Project ID: $GCP_PROJECT_ID"
echo "GCP Region: $GCP_REGION"
echo "Terraform State Bucket: $TERRAFORM_STATE_BUCKET"
echo ""

# Step 1: Validate prerequisites
echo "[1/6] Validating prerequisites..."
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install Google Cloud SDK."
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo "❌ terraform not found. Please install Terraform."
    exit 1
fi

echo "✅ Prerequisites validated"
echo ""

# Step 2: Create GCS bucket for state
echo "[2/6] Creating GCS bucket for Terraform state..."
if gsutil ls -b "gs://${TERRAFORM_STATE_BUCKET}" &> /dev/null; then
    echo "⚠️  Bucket already exists: gs://${TERRAFORM_STATE_BUCKET}"
else
    gsutil mb -p "$GCP_PROJECT_ID" "gs://${TERRAFORM_STATE_BUCKET}"
    echo "✅ Created bucket: gs://${TERRAFORM_STATE_BUCKET}"
fi

# Enable versioning
gsutil versioning set on "gs://${TERRAFORM_STATE_BUCKET}"
echo "✅ Enabled versioning on bucket"
echo ""

# Step 3: Create KMS key for state encryption
echo "[3/6] Creating KMS encryption key..."
if gcloud kms keyrings describe "$KMS_KEYRING" \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" &> /dev/null; then
    echo "⚠️  Keyring already exists: $KMS_KEYRING"
else
    gcloud kms keyrings create "$KMS_KEYRING" \
        --location="$GCP_REGION" \
        --project="$GCP_PROJECT_ID"
    echo "✅ Created KMS keyring: $KMS_KEYRING"
fi

if gcloud kms keys describe "$KMS_KEY" \
    --location="$GCP_REGION" \
    --keyring="$KMS_KEYRING" \
    --project="$GCP_PROJECT_ID" &> /dev/null; then
    echo "⚠️  Key already exists: $KMS_KEY"
else
    gcloud kms keys create "$KMS_KEY" \
        --location="$GCP_REGION" \
        --keyring="$KMS_KEYRING" \
        --purpose=encryption \
        --project="$GCP_PROJECT_ID"
    echo "✅ Created KMS key: $KMS_KEY"
fi
echo ""

# Step 4: Configure IAM for Terraform service account
echo "[4/6] Configuring IAM permissions..."
TERRAFORM_SA_EMAIL="terraform@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Grant permissions on state bucket
gsutil iam ch "serviceAccount:${TERRAFORM_SA_EMAIL}:objectAdmin" "gs://${TERRAFORM_STATE_BUCKET}"
echo "✅ Granted objectAdmin on state bucket to $TERRAFORM_SA_EMAIL"

# Grant KMS permissions
gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
    --location="$GCP_REGION" \
    --keyring="$KMS_KEYRING" \
    --member="serviceAccount:${TERRAFORM_SA_EMAIL}" \
    --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
    --project="$GCP_PROJECT_ID" \
    --quiet
echo "✅ Granted KMS permissions to $TERRAFORM_SA_EMAIL"
echo ""

# Step 5: Initialize Terraform with new backend
echo "[5/6] Initializing Terraform with GCS backend..."
cd "$(dirname "$0")/terraform" || exit 1

# Create backend config file
cat > gcs-backend.tf <<EOF
terraform {
  backend "gcs" {
    bucket = "${TERRAFORM_STATE_BUCKET}"
    prefix = "terraform/state"
  }
}
EOF

echo "✅ Created GCS backend configuration"

# Run terraform init (will prompt about state migration if needed)
echo ""
echo "Running 'terraform init'..."
echo "⚠️  If prompted about existing AWS state, reply 'yes' to copy state to new backend"
echo ""

terraform init -upgrade
echo "✅ Terraform initialized with GCS backend"
echo ""

# Step 6: Validate state was migrated
echo "[6/6] Validating state migration..."

if terraform state list | grep -q "module"; then
    echo "✅ State successfully migrated to GCS"
    echo ""
    echo "Resources in state:"
    terraform state list | head -5
else
    echo "⚠️  State appears empty. This may be expected for first migration."
fi

echo ""
echo "============================================"
echo "✅ Migration Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Review terraform plan: terraform plan"
echo "2. Apply Terraform: terraform apply"
echo "3. Verify deployment: gcloud run services list"
echo "4. Test backups: infrastructure/docker/backup-runner/"
echo ""
