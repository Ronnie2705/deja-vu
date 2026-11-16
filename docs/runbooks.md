# Déjà Vu — Runbook pages to create in Confluence

Create a Confluence **space** named **Payments Ops Runbooks** (the app looks for a space whose
name contains "Runbook", so the exact key doesn't matter — but if you can set the key, use `RUN`).

Then create these **four** pages in that space. Paste each title and body as-is. The wording is
chosen so the matcher links each page to the right incidents.

**Do not create a PayRail / failover runbook** — that gap is deliberate, and it's what makes the
"⚠️ no runbook exists" moment in the demo.

After creating the pages, run **"Rebuild the Déjà Vu index"** in Rovo so the app picks them up.

---

## Page 1 — title: `Rollback payments-api after a bad release`

**Service:** payments-api

**Symptoms**
- HTTP 502 or 503 from payments-api
- Upstream timeout, error rate spikes right after a release deploy

**Diagnosis**
1. Identify the release version that just went out.
2. Confirm the error spike started at the deploy time.

**Fix**
- Roll back to the previous release via the pipeline.

**Rollback**
- Trigger the pipeline rollback to the previous stable version.

**Owner:** Maya Chen

---

## Page 2 — title: `Ledger DB connection exhaustion`

**Service:** ledger-db

**Symptoms**
- Too many connections, pool timeout, "connection is not available"
- Latency spike on ledger writes

**Diagnosis**
1. Check active connections and long-running queries.

**Fix**
- Kill idle-in-transaction and long queries, then raise the pool size.

**Owner:** Arjun Rao

---

## Page 3 — title: `Rotate auth-gateway certificates`

**Service:** auth-gateway

**Symptoms**
- Certificate has expired, SSL handshake failed
- x509 certificate expired, certificate verify failed

**Fix**
- Rotate the certificate from the vault and restart the gateway.

**Owner:** Lena Ortiz

---

## Page 4 — title: `Notifications backlog and consumer lag`

**Service:** notifications-worker

**Symptoms**
- Consumer lag, notifications or emails delayed
- Rebalance loop

**Fix**
- Scale the consumers, clear the stuck partition, move poison messages to the DLQ.

**Owner:** Sam Okafor
