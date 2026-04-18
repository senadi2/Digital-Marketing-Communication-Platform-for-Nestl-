# Deploy This App on Render

## 1) Push code to GitHub
1. Create a GitHub repo (or use existing).
2. Push this project.

## 2) Create the Render web service
1. Open Render Dashboard -> `New` -> `Blueprint`.
2. Connect your GitHub repo.
3. Render will detect `render.yaml` and create the service.

## 3) Set required environment variables
In Render -> Service -> `Environment`, add:

1. `FIREBASE_PROJECT_ID` = your Firebase project id
2. `FIREBASE_SERVICE_ACCOUNT_JSON` = full Firebase service account JSON as a single line

Notes:
- Do not upload `firebase-service-account.json` to Render.
- Keep secrets only in Render environment variables.

## 4) Deploy
1. Click `Deploy latest commit`.
2. Wait for build + start logs.
3. Open the Render URL once status is `Live`.

## 5) Verify quickly
1. Visit your Render URL in browser.
2. Open `https://<your-render-url>/api/notifications?userId=test`.
3. If Firebase is configured correctly, you should get JSON (or a logical app error, not Firebase config error).

## Troubleshooting
- If you see `Firebase is not configured`, recheck `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID`.
- If deploy fails on Node version, keep `NODE_VERSION=20.19.0` in Render env.
