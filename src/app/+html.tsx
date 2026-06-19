import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}
*:focus {
  outline-color: #1a1a1a !important;
}
input:focus, textarea:focus, select:focus {
  outline-color: #1a1a1a !important;
}

/* ── Scrollbar visibility ── */
html, body, * {
  scrollbar-width: thin !important;
  scrollbar-color: rgba(0,0,0,0.22) transparent !important;
}
::-webkit-scrollbar {
  display: block !important;
  width: 8px !important;
  height: 8px !important;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0,0,0,0.38);
  background-clip: content-box;
  border: 2px solid transparent;
}
::-webkit-scrollbar-corner {
  background: transparent;
}`;
