// Serves /i/:code (via the vercel.json rewrite), which link-unfurling bots (WhatsApp/iMessage/
// Slack/Twitter) request directly and never execute JS on — so the OG meta tags below must be
// present in this initial HTML response. A real human clicking the link gets redirected into the
// actual game by the inline script. See docs/adr/0005-dynamic-share-previews.md.
export const config = { runtime: 'edge' };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default function handler(request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').toUpperCase().slice(0, 4);
  const name = (url.searchParams.get('n') || '').slice(0, 24);
  const title = name ? `${name} invited you to play Midnight Pool` : 'Join a game of Midnight Pool';
  const ogImage = `${url.origin}/api/og?n=${encodeURIComponent(name)}`;
  const redirectTo = `/?join=${encodeURIComponent(code)}`;

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="Tap to join the table.">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${escapeHtml(redirectTo)}">
<script>location.replace(${JSON.stringify(redirectTo)});</script>
</head><body></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
