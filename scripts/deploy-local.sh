#!/usr/bin/env bash
set -euo pipefail

# Deploy to EKS from a local machine (bypasses GitHub Actions).
# Usage:
#   ./scripts/deploy-local.sh              # Build + push + deploy
#   ./scripts/deploy-local.sh --deploy-only # Deploy existing "latest" image

export AWS_PROFILE="${AWS_PROFILE:-twenty-admin}"
AWS_REGION="us-east-1"
ECR_REPO="twenty-crm"
ECR_REGISTRY="189365142140.dkr.ecr.${AWS_REGION}.amazonaws.com"
EKS_CLUSTER="twenty-crm"
HELM_RELEASE="my-twenty"
NAMESPACE="twentycrm"
TAG=$(git rev-parse --short HEAD)

DEPLOY_ONLY=false
if [[ "${1:-}" == "--deploy-only" ]]; then
  DEPLOY_ONLY=true
  TAG="latest"
fi

echo "============================================================"
echo "Local Deploy — tag: ${TAG}"
echo "============================================================"

# 1. AWS + ECR login
echo "→ Logging into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

if [[ "${DEPLOY_ONLY}" == "false" ]]; then
  # 2. Build for amd64 and push
  echo "→ Building linux/amd64 image (this takes a while on Apple Silicon)..."
  docker buildx build \
    --platform linux/amd64 \
    --file packages/twenty-docker/twenty/Dockerfile \
    --build-arg REACT_APP_SERVER_BASE_URL=/api \
    --tag "${ECR_REGISTRY}/${ECR_REPO}:${TAG}" \
    --tag "${ECR_REGISTRY}/${ECR_REPO}:latest" \
    --push \
    .
  echo "→ Image pushed: ${ECR_REGISTRY}/${ECR_REPO}:${TAG}"
fi

# 3. Update kubeconfig
echo "→ Updating kubeconfig for ${EKS_CLUSTER}..."
aws eks update-kubeconfig --name "${EKS_CLUSTER}" --region "${AWS_REGION}"

# 4. Helm deploy
echo "→ Deploying with Helm..."
helm upgrade --install "${HELM_RELEASE}" \
  ./packages/twenty-docker/helm/twenty \
  --namespace "${NAMESPACE}" \
  --values packages/twenty-docker/helm/twenty/omnia-values.yaml \
  --set "server.image.repository=${ECR_REGISTRY}/${ECR_REPO}" \
  --set "server.image.tag=${TAG}" \
  --set "worker.image.repository=${ECR_REGISTRY}/${ECR_REPO}" \
  --set "worker.image.tag=${TAG}" \
  --wait \
  --atomic \
  --timeout 10m

echo ""
echo "============================================================"
echo "Deploy complete — https://crm.omniaagent.com"
echo "============================================================"
