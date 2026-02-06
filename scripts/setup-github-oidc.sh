#!/bin/bash
set -e

# Configuration
ACCOUNT_ID="189365142140"
GITHUB_ORG="Omnia-Insurance"
GITHUB_REPO="crm"
ROLE_NAME="github-actions-twenty-deploy"
REGION="us-east-1"

echo "Setting up GitHub Actions OIDC for EKS deployment..."

# Check if OIDC provider already exists
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" 2>/dev/null; then
    echo "Creating GitHub OIDC provider..."
    aws iam create-open-id-connect-provider \
        --url https://token.actions.githubusercontent.com \
        --client-id-list sts.amazonaws.com \
        --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd
    echo "OIDC provider created"
else
    echo "GitHub OIDC provider already exists"
fi

# Create trust policy
TRUST_POLICY=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
                }
            }
        }
    ]
}
EOF
)

# Create permissions policy
PERMISSIONS_POLICY=$(cat <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ECRPush",
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:PutImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload"
            ],
            "Resource": "*"
        },
        {
            "Sid": "EKSAccess",
            "Effect": "Allow",
            "Action": [
                "eks:DescribeCluster",
                "eks:ListClusters"
            ],
            "Resource": "arn:aws:eks:${REGION}:${ACCOUNT_ID}:cluster/twenty-crm"
        }
    ]
}
EOF
)

# Check if role exists
if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
    echo "Role $ROLE_NAME already exists, updating trust policy..."
    aws iam update-assume-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-document "$TRUST_POLICY"
else
    echo "Creating IAM role: $ROLE_NAME"
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY" \
        --description "GitHub Actions role for Twenty CRM EKS deployment"
fi

# Create or update inline policy
echo "Attaching permissions policy..."
aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "twenty-deploy-permissions" \
    --policy-document "$PERMISSIONS_POLICY"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "================================================"
echo "Setup complete!"
echo ""
echo "IAM Role ARN: $ROLE_ARN"
echo ""
echo "Next steps:"
echo "1. Add this secret to your GitHub repository:"
echo "   Name: AWS_ROLE_ARN"
echo "   Value: $ROLE_ARN"
echo ""
echo "2. Grant the role access to EKS cluster:"
echo "   kubectl edit configmap aws-auth -n kube-system"
echo "   Add under mapRoles:"
echo "   - rolearn: $ROLE_ARN"
echo "     username: github-actions"
echo "     groups:"
echo "       - system:masters"
echo ""
echo "Or run this command after authenticating kubectl:"
echo "eksctl create iamidentitymapping \\"
echo "  --cluster twenty-crm \\"
echo "  --region us-east-1 \\"
echo "  --arn $ROLE_ARN \\"
echo "  --username github-actions \\"
echo "  --group system:masters"
echo "================================================"
