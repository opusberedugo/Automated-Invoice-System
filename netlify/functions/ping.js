// Minimal health check — zero dependencies, zero bundling risk
export const handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify({ ok: true, message: 'Netlify functions are working!', ts: Date.now() })
});
