// Sets a CORS rule on the Backblaze B2 bucket so the browser can upload directly via
// presigned PUT and download via presigned GET.
//
// Uses the B2 NATIVE API (b2_authorize_account + b2_update_bucket), which works with the
// master application key. (B2's S3-compatible API does NOT accept the master key, and a
// bucket-restricted key lacks the writeBuckets capability needed to set CORS.)
//
// Usage (PowerShell), from the project root:
//   $env:B2_KEY_ID="<masterKeyId>"
//   $env:B2_APP_KEY="<masterApplicationKey>"
//   $env:B2_BUCKET_ID="af77a0738cc6f7949bea0816"
//   $env:APP_ORIGINS="http://localhost:3000,https://*.vercel.app"
//   node scripts/set-b2-cors.mjs

const keyId = process.env.B2_KEY_ID;
const appKey = process.env.B2_APP_KEY;
const bucketId = process.env.B2_BUCKET_ID;
const origins = (process.env.APP_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim());

if (!keyId || !appKey || !bucketId) {
  console.error("Missing B2_KEY_ID, B2_APP_KEY, or B2_BUCKET_ID.");
  process.exit(1);
}

const auth = Buffer.from(`${keyId}:${appKey}`).toString("base64");
const authRes = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: { Authorization: `Basic ${auth}` },
});
if (!authRes.ok) throw new Error(`authorize failed: ${authRes.status} ${await authRes.text()}`);
const authData = await authRes.json();
const apiUrl = authData.apiInfo.storageApi.apiUrl;
const accountId = authData.accountId;
const token = authData.authorizationToken;

const corsRules = [
  {
    corsRuleName: "cdviewerApp",
    allowedOrigins: origins,
    allowedOperations: ["s3_put", "s3_get", "s3_head"],
    allowedHeaders: ["*"],
    exposeHeaders: ["etag"],
    maxAgeSeconds: 3600,
  },
];

const upRes = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
  method: "POST",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({ accountId, bucketId, corsRules }),
});
const text = await upRes.text();
if (!upRes.ok) throw new Error(`update failed: ${upRes.status} ${text}`);

const result = JSON.parse(text);
console.log("✅ CORS set on bucket:", result.bucketName);
console.log(JSON.stringify(result.corsRules, null, 2));
