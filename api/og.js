import { ImageResponse } from '@vercel/og';

// Deliberately avoids JSX (see docs/adr/0005-dynamic-share-previews.md): this file is unverified
// without a real Vercel deploy, and plain object literals sidestep any JSX-transpilation
// uncertainty for a non-framework Vite project. `el(...)` mirrors what JSX compiles to.
export const config = { runtime: 'edge' };

function el(type, props, ...children) {
  return { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
}

export default function handler(request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('n') || '').slice(0, 24) || 'A friend';

  return new ImageResponse(
    el(
      'div',
      {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', background: '#04080a', color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        },
      },
      el('div', { style: { fontSize: 64, fontWeight: 800, color: '#4ee892' } }, '\u{1F3B1} Midnight Pool'),
      el('div', { style: { fontSize: 40, marginTop: 24 } }, `${name} invited you to a game`),
    ),
    { width: 1200, height: 630 },
  );
}
