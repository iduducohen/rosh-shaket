// Serves crawl files with the live origin, so preview domains and the real domain stay correct.
export const config = {
  matcher: ['/robots.txt', '/sitemap.xml'],
};

export default function middleware(request) {
  const origin = new URL(request.url).origin;
  const path = new URL(request.url).pathname;
  if (path === '/robots.txt') {
    return new Response(robots(origin), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }
  return new Response(sitemap(origin), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

function robots(origin) {
  return `User-agent: *
Allow: /
Disallow: /start
Disallow: /reason
Disallow: /details
Disallow: /results

Sitemap: ${origin}/sitemap.xml
`;
}

function sitemap(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${origin}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${origin}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`;
}
