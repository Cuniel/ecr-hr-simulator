#!/usr/bin/env bash
set -euo pipefail

PROFILE="GLB-1033"
REGION="us-east-1"
ACCOUNT_ID="103339360083"
REPO_NAME="ecr-hr"
FUNCTION_NAME="ecr-hr"
IMAGE_TAG="latest"

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${ECR_REGISTRY}/${REPO_NAME}:${IMAGE_TAG}"

echo "==> 1. Check AWS SSO session"
if aws sts get-caller-identity \
  --profile "${PROFILE}" \
  --region "${REGION}" \
  >/dev/null 2>&1; then
  echo "AWS SSO session is valid, skip login."
else
  echo "AWS SSO session expired or unavailable, logging in..."
  aws sso login --profile "${PROFILE}"
fi

echo "==> 2. Check ECR login"
if docker manifest inspect "${IMAGE_URI}" >/dev/null 2>&1; then
  echo "ECR docker login is valid, skip login."
else
  echo "ECR docker login expired or unavailable, logging in..."
  aws ecr get-login-password \
    --region "${REGION}" \
    --profile "${PROFILE}" \
  | docker login \
    --username AWS \
    --password-stdin "${ECR_REGISTRY}"
fi

echo "==> 3. Build image"
docker build -f docker/Dockerfile -t "${REPO_NAME}:${IMAGE_TAG}" .

echo "==> 4. Tag image"
docker tag "${REPO_NAME}:${IMAGE_TAG}" "${IMAGE_URI}"

echo "==> 5. Push image"
docker push "${IMAGE_URI}"

echo "==> 6. Update Lambda image"
aws lambda update-function-code \
  --function-name "${FUNCTION_NAME}" \
  --image-uri "${IMAGE_URI}" \
  --region "${REGION}" \
  --profile "${PROFILE}" >/dev/null

echo "==> 7. Wait Lambda updated"
aws lambda wait function-updated \
  --function-name "${FUNCTION_NAME}" \
  --region "${REGION}" \
  --profile "${PROFILE}"

echo "==> 8. Clean non-latest ECR images"
DIGESTS_TO_DELETE=$(aws ecr describe-images \
  --profile "${PROFILE}" \
  --region "${REGION}" \
  --repository-name "${REPO_NAME}" \
  --query 'imageDetails[?!contains(imageTags || `[]`, `latest`)].imageDigest' \
  --output text)

if [ -n "${DIGESTS_TO_DELETE}" ]; then
  echo "${DIGESTS_TO_DELETE}" | tr '\t' '\n' | while read -r digest; do
    if [ -n "${digest}" ]; then
      echo "Deleting ${digest}"
      aws ecr batch-delete-image \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --repository-name "${REPO_NAME}" \
        --image-ids imageDigest="${digest}" >/dev/null
    fi
  done
else
  echo "No non-latest images to delete."
fi

echo "==> 9. Done"
echo "Image: ${IMAGE_URI}"
