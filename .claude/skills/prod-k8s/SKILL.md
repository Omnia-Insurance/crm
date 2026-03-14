---
name: prod-k8s
description: |
  Connect to the Omnia CRM production Kubernetes cluster (AWS EKS) and run commands.
  Use when: accessing production database, exec into server pods, checking pod status,
  running migrations, invalidating cache, or any production infrastructure task.
  Trigger words: "production", "prod", "k8s", "kubernetes", "production pod", "production db".
---

# Production Kubernetes Access

## Cluster Details

- **AWS Profile**: `twenty-admin`
- **EKS Cluster**: `twenty-crm`
- **Region**: `us-east-1`
- **Namespace**: `twentycrm`
- **Domain**: `crm.omniaagent.com`

## Quick Reference

### Ensure kubectl is configured

```bash
AWS_PROFILE=twenty-admin aws eks update-kubeconfig --name twenty-crm --region us-east-1
```

### Common Commands

**Check pods:**
```bash
kubectl get pods -n twentycrm
```

**Exec into server pod:**
```bash
kubectl exec -it deployment/my-twenty-twenty-server -n twentycrm -- sh
```
Note: The container uses a slim image — `bash` is NOT available, use `sh` instead.

**Run a command in server pod (non-interactive):**
```bash
kubectl exec deployment/my-twenty-twenty-server -n twentycrm -- sh -c "<command>"
```

**Tail server logs:**
```bash
kubectl logs -f deployment/my-twenty-twenty-server -n twentycrm --tail=100
```

**Tail worker logs:**
```bash
kubectl logs -f deployment/my-twenty-twenty-worker -n twentycrm --tail=100
```

### Database Access

**Get database password:**
```bash
DB_PASSWORD=$(kubectl get secret twenty-rds-credentials -n twentycrm -o jsonpath='{.data.password}' | base64 --decode)
```

**Database connection string:**
```
postgres://twenty_app_user:${DB_PASSWORD}@twenty-crm-db.cluster-cgx4wwy00vhj.us-east-1.rds.amazonaws.com:5432/twenty
```

**Run psql via kubectl exec (preferred — no port-forward needed):**
```bash
DB_PASSWORD=$(kubectl get secret twenty-rds-credentials -n twentycrm -o jsonpath='{.data.password}' | base64 --decode)
kubectl exec deployment/my-twenty-twenty-server -n twentycrm -- sh -c "PGPASSWORD='$DB_PASSWORD' psql -h twenty-crm-db.cluster-cgx4wwy00vhj.us-east-1.rds.amazonaws.com -U twenty_app_user -d twenty -c 'SELECT 1;'"
```

### Cache Invalidation

```bash
kubectl exec deployment/my-twenty-twenty-server -n twentycrm -- npx ts-node -e "require('./dist/src/database/commands/cache/flat-cache-invalidate.command.js')" -- --all-metadata
```

### Redis

```bash
# Flush all via netcat from inside the server pod (preferred — no extra image pull needed)
kubectl exec deployment/my-twenty-twenty-server -n twentycrm -- sh -c 'echo "FLUSHALL" | nc my-twenty-twenty-redis 6379'

# Port forward redis (for local redis-cli access)
kubectl port-forward -n twentycrm svc/my-twenty-twenty-redis 6379:6379
```

### Service Names

| Service | Internal DNS |
|---------|-------------|
| Server | `my-twenty-twenty-server` |
| Worker | `my-twenty-twenty-worker` |
| Redis | `my-twenty-twenty-redis` |

### Helm

```bash
# Check current release
AWS_PROFILE=twenty-admin helm list -n twentycrm

# Values file
cat packages/twenty-docker/helm/twenty/omnia-values.yaml
```

### Deployments

Automatic via GitHub Actions on push to `main`. Manual:
```bash
helm upgrade --install my-twenty ./packages/twenty-docker/helm/twenty \
  --namespace twentycrm \
  --values packages/twenty-docker/helm/twenty/omnia-values.yaml
```

## Important Notes

- Production has 2 server replicas — `kubectl exec deployment/...` picks one automatically
- Database is external RDS Aurora PostgreSQL (not in-cluster)
- Always confirm with user before running destructive operations in production
- The `twenty-admin` AWS profile must be configured in `~/.aws/config`
