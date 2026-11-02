# Chùa Việt Online — VietQR payment sandbox

**TEST ONLY. NO REAL BANK CONFIRMATION OR AUTOMATIC TRANSFERS.** This is a local prototype for APK distributed outside Google Play, not a live payment gateway.

## Start (Node.js 20+)

```bash
cd ChuaVietOnline/payment-sandbox
SANDBOX_ADMIN_SECRET=replace-with-long-random-secret npm start
```

On Windows PowerShell:
```powershell
$env:SANDBOX_ADMIN_SECRET="replace-with-long-random-secret"
npm start
```

Server binds to `127.0.0.1:8787` by default. Orders and inventory persist in `data/orders.json`. Do not commit this file. No secrets or bank account numbers are stored in the repo.

Endpoints:
- `GET /health` and `GET /api/items`
- `POST /api/orders` JSON `{"playerId":"player001","itemId":"lotus"}`
- `GET /api/orders/:id`
- `GET /api/inventory/:playerId`
- `POST /api/sandbox/confirm` with header `Authorization: Bearer <SANDBOX_ADMIN_SECRET>` and JSON `{"orderId":"...","transactionId":"test000001","amount":10000,"transferContent":"CV..."}`. The order response supplies the exact transfer content.

To show a **demo QR**, set `VIETQR_ACCOUNT_NO` in server environment (MB Bank BIN defaults to `970422`). This is a QR *display*, not proof of payment. Do **not** scan and send real money during sandbox testing.

## Before real money
1. Deploy server behind HTTPS, authenticate each player (never trust client-supplied playerId), rate-limit, and restrict CORS.
2. Register an authorized bank/payment provider with verified callbacks or reconciliation API; verify provider signatures, amount, destination account, transfer reference and unique transaction ID on the server.
3. Persist orders, ledger and inventory in a transactional database; atomic idempotent settlement and delivery.
4. Remove/disable sandbox confirmation endpoints in production; keep provider credentials and account info in server secrets, never APK.
5. Define refunds, expiration/late transfers, support/disputes, privacy and accounting policies. Test thoroughly before enabling production.

**Security caveat:** Sandbox `GET /api/inventory/:playerId` and `POST /api/orders` are unauthenticated demo APIs. Never expose this prototype publicly as-is.
