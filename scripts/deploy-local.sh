#!/usr/bin/env bash
set -euo pipefail

# Deploy to EKS from a local machine (bypasses GitHub Actions).
# Usage:
#   ./scripts/deploy-local.sh               # Build + push + deploy the current commit
#   ./scripts/deploy-local.sh --deploy-only # Deploy the image already pushed for the current commit

cd "$(git rev-parse --show-toplevel)"

export AWS_PROFILE="${AWS_PROFILE:-twenty-admin}"
AWS_REGION="us-east-1"
ECR_REPO="twenty-crm"
ECR_REGISTRY="189365142140.dkr.ecr.${AWS_REGION}.amazonaws.com"
EKS_CLUSTER="twenty-crm"
HELM_RELEASE="my-twenty"
NAMESPACE="twentycrm"
# Same 7-character tag as the docker/metadata-action sha tag in deploy-eks.yaml
# (--short=7 grows past 7 characters when the prefix is ambiguous).
TAG=$(git rev-parse HEAD | cut -c1-7)
# APP_VERSION must equal the server's upgrade version (same derivation as deploy-eks.yaml).
APP_VERSION=$(sed -n "s/^export const TWENTY_CURRENT_VERSION = '\([0-9.]*\)'.*/\1/p" \
  packages/twenty-server/src/engine/core-modules/upgrade/constants/twenty-current-version.constant.ts)

if [[ -z "${APP_VERSION}" ]]; then
  echo "ERROR: could not read TWENTY_CURRENT_VERSION from twenty-current-version.constant.ts" >&2
  exit 1
fi

DEPLOY_ONLY=false
if [[ "${1:-}" == "--deploy-only" ]]; then
  DEPLOY_ONLY=true
fi

echo "============================================================"
echo "Local Deploy — tag: ${TAG}, APP_VERSION: ${APP_VERSION}"
echo "============================================================"

# 1. AWS + ECR login
echo "→ Logging into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

if [[ "${DEPLOY_ONLY}" == "false" ]]; then
  # 2. Build for amd64 and push. Without --target, Docker builds the last
  # stage, the all-in-one twenty-app-dev image.
  echo "→ Building linux/amd64 image (this takes a while on Apple Silicon)..."
  docker buildx build \
    --platform linux/amd64 \
    --file packages/twenty-docker/twenty/Dockerfile \
    --target twenty \
    --build-arg "APP_VERSION=${APP_VERSION}" \
    --tag "${ECR_REGISTRY}/${ECR_REPO}:${TAG}" \
    --push \
    .
  echo "→ Image pushed: ${ECR_REGISTRY}/${ECR_REPO}:${TAG}"
else
  # A missing tag would otherwise only fail after the Helm timeout.
  echo "→ Checking that ${ECR_REPO}:${TAG} exists in ECR..."
  aws ecr describe-images \
    --region "${AWS_REGION}" \
    --repository-name "${ECR_REPO}" \
    --image-ids "imageTag=${TAG}" >/dev/null
fi

# 3. Update kubeconfig
echo "→ Updating kubeconfig for ${EKS_CLUSTER}..."
aws eks update-kubeconfig --name "${EKS_CLUSTER}" --region "${AWS_REGION}"

# 4. Helm deploy. --set-string keeps an all-digit short SHA a string; the
# timeout covers the pre-upgrade migration job (activeDeadlineSeconds 3600).
# No --install and no --atomic, for the reasons in deploy-eks.yaml.
echo "→ Deploying with Helm..."
helm upgrade "${HELM_RELEASE}" \
  ./packages/twenty-docker/helm/twenty \
  --namespace "${NAMESPACE}" \
  --values packages/twenty-docker/helm/twenty/omnia-values.yaml \
  --set "server.image.repository=${ECR_REGISTRY}/${ECR_REPO}" \
  --set-string "server.image.tag=${TAG}" \
  --set "worker.image.repository=${ECR_REGISTRY}/${ECR_REPO}" \
  --set-string "worker.image.tag=${TAG}" \
  --wait \
  --timeout 65m

echo ""
echo "============================================================"
echo "Deploy complete — https://crm.omniaagent.com"
echo "============================================================"
