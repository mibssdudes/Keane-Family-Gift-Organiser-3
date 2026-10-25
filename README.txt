KEANE FAMILY GIFT ORGANISER — SETUP NOTES

This package is prepared for the existing Netlify-connected GitHub repository.
Do not upload Firebase service-account credentials or passwords to GitHub.

Files in this package:
- index.html (the existing design, updated to use the server API)
- netlify/functions/family-data.js (server-side Firebase access and password check)
- package.json (Firebase Admin SDK dependency)
- netlify.toml (Netlify publish and function configuration)

Before using the site, the Netlify site needs these environment variables, each scoped to Production and marked secret where available:
1. FAMILY_PASSWORD — the shared family password already added by the owner.
2. FAMILY_SESSION_SECRET — a separate long random secret, at least 32 random characters.
3. FIREBASE_SERVICE_ACCOUNT — the full JSON contents of a Firebase service-account key for the correct Firebase project. Treat this as highly sensitive. Never put it in GitHub, this README, or a public chat.

The Firebase service account needs permission to access the project's Realtime Database. The function uses the configured database URL in the source file. Keep Realtime Database rules locked (read=false, write=false); Firebase Admin access runs on the server and bypasses client rules.

After changing Netlify environment variables, trigger a new deploy so the function receives them. Test the deployed preview/site before relying on it. The first server read initializes the nine original sample gifts if the database path is empty. If there is already data at /familyGiftList, it will be retained.

Important: this is a prepared integration, not yet a verified live deployment. Do not delete the old website or change database rules to public access. Confirm that the correct Firebase project and service account are used before deployment.
