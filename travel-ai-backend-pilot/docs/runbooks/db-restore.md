# Database Restore Runbook (Aurora PostgreSQL)

## Trigger conditions
- Data corruption, accidental destructive change, irrecoverable migration issue.

## Steps
1. Identify restore point:
```bash
aws rds describe-db-clusters --db-cluster-identifier <cluster-id>
```
2. Restore cluster to point in time:
```bash
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier <new-cluster-id> \
  --source-db-cluster-identifier <old-cluster-id> \
  --restore-to-time <UTC timestamp> \
  --db-subnet-group-name <subnet-group> \
  --vpc-security-group-ids <db-sg>
```
3. Create writer instance for restored cluster.
4. Update `DATABASE_URL` secret to point at restored endpoint.
5. Force ECS redeploy to pick up new secret value.

## Verify
- `/health` green
- Migration check task exits 0
- RAG query smoke tests return citations
