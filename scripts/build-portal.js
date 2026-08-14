import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');

const portalHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>West Coast Animal Hospital — OMS Documentation Library</title>
  <meta name="description" content="Multi-tenant documentation portal and Hall of Records for WCAH Operations Management System (OMS)." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0f1722;
      --card-bg: #182330;
      --card-border: #283747;
      --text: #f8fafc;
      --muted: #8da2b5;
      --accent-wcah: #516d7d;
      --accent-v0: #0d9488;
      --accent-v1: #2563eb;
      --accent-v2: #7c3aed;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3.5rem 1.5rem;
    }
    .container {
      width: 100%;
      max-width: 1100px;
    }
    .header {
      text-align: center;
      margin-bottom: 3.5rem;
    }
    .badge {
      display: inline-block;
      padding: 0.4rem 0.95rem;
      border-radius: 9999px;
      background: rgba(81, 109, 125, 0.25);
      color: #8ec3df;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 1rem;
      border: 1px solid rgba(98, 151, 181, 0.35);
    }
    h1 {
      font-size: 2.75rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #ffffff 0%, #cbdbe6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      font-size: 1.15rem;
      color: var(--muted);
      line-height: 1.6;
      max-width: 720px;
      margin: 0 auto;
    }

    /* Featured Anchor Card (WCAH Hospital Branding) */
    .featured-card {
      background: linear-gradient(145deg, #1b2c3a 0%, #131e28 100%);
      border: 1px solid #516d7d;
      border-radius: 1.25rem;
      padding: 2.25rem;
      margin-top: 2.5rem;
      margin-bottom: 2.5rem;
      text-decoration: none;
      color: inherit;
      display: block;
      transition: all 0.25s ease;
      box-shadow: 0 10px 30px -10px rgba(81, 109, 125, 0.35);
    }
    .featured-card:hover {
      transform: translateY(-4px);
      border-color: #6297b5;
      box-shadow: 0 20px 35px -10px rgba(98, 151, 181, 0.45);
    }
    .featured-badge {
      display: inline-block;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      background: rgba(98, 151, 181, 0.2);
      color: #a4d2eb;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 0.75rem;
      border: 1px solid rgba(98, 151, 181, 0.3);
    }
    .featured-title {
      font-size: 1.85rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 0.75rem;
    }
    .featured-desc {
      font-size: 1.05rem;
      color: #cbdbe6;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .featured-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 1.25rem;
    }
    .featured-pill {
      font-size: 0.9rem;
      color: #8ec3df;
      font-weight: 600;
    }
    .featured-btn {
      color: #6297b5;
      font-weight: 700;
      font-size: 1.05rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #8da2b5;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.75rem;
      width: 100%;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-decoration: none;
      color: inherit;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 4px;
    }
    .card-v0::before { background: var(--accent-v0); }
    .card-v1::before { background: var(--accent-v1); }
    .card-v2::before { background: var(--accent-v2); }
    .card:hover {
      transform: translateY(-4px);
      border-color: #516d7d;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.35), 0 10px 10px -5px rgba(0, 0, 0, 0.25);
    }
    .card-version {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    .card-v0 .card-version { color: #2dd4bf; }
    .card-v1 .card-version { color: #60a5fa; }
    .card-v2 .card-version { color: #c084fc; }
    .card-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: #ffffff;
    }
    .card-desc {
      font-size: 0.95rem;
      color: var(--muted);
      line-height: 1.55;
      margin-bottom: 1.5rem;
    }
    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--muted);
      border-top: 1px solid var(--card-border);
      padding-top: 1rem;
      margin-top: auto;
    }
    .card-btn {
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .card-v0 .card-btn { color: #2dd4bf; }
    .card-v1 .card-btn { color: #60a5fa; }
    .card-v2 .card-btn { color: #c084fc; }
    .footer {
      margin-top: 4.5rem;
      font-size: 0.875rem;
      color: var(--muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <span class="badge">Pagenary Multi-Tenant Library</span>
      <h1>West Coast Animal Hospital</h1>
      <p class="subtitle">Operations Management System (OMS) documentation library spanning all architectural generations from the foundational business problem to next-generation clean-slate systems.</p>
    </header>

    <!-- Anchor Tenant (WCAH Hospital Branding) -->
    <a href="./wcah/" class="featured-card">
      <div>
        <span class="featured-badge">Anchor Portal · Master Archive</span>
        <h2 class="featured-title">🏛️ WCAH: OMS Hall of Records</h2>
        <p class="featured-desc">The central anchor portal for the entire project. Features the original business genesis, the complete scheduling epic specification, 12-factor production architecture blueprints, cross-generational timeline, and an in-depth retrospective analyzing our 'greenfield next to brownfield' iterative development model.</p>
      </div>
      <div class="featured-meta">
        <span class="featured-pill">11 Core Chapters & Comprehensive Timeline</span>
        <span class="featured-btn">Enter Hall of Records →</span>
      </div>
    </a>

    <div class="section-title">Generational Repository Archives</div>

    <main class="grid">
      <a href="./oms-v0/" class="card card-v0">
        <div>
          <div class="card-version">Tenant: oms-v0</div>
          <h2 class="card-title">OMS v0 (Scheduler)</h2>
          <p class="card-desc">The original Scheduler MVP documentation repository. Includes comprehensive specs, implementation plans, and 22 Spec-Driven Development task reports.</p>
        </div>
        <div class="card-meta">
          <span>64 Documents</span>
          <span class="card-btn">Explore Docs →</span>
        </div>
      </a>

      <a href="./oms-v1/" class="card card-v1">
        <div>
          <div class="card-version">Tenant: oms-v1</div>
          <h2 class="card-title">OMS v1 (Full Stack)</h2>
          <p class="card-desc">Full-stack OMS architecture with FastAPI backend and Vite React frontend. Features domain models, conformance contracts, modular DB design, and Document API specs.</p>
        </div>
        <div class="card-meta">
          <span>60 Documents</span>
          <span class="card-btn">Explore Docs →</span>
        </div>
      </a>

      <a href="./oms-v2/" class="card card-v2">
        <div>
          <div class="card-version">Tenant: oms-v2</div>
          <h2 class="card-title">OMS v2 (Next-Gen)</h2>
          <p class="card-desc">Greenfield next-generation OMS platform (oms-new). Features foundation slice specifications, open domain items, data conversion dictionaries, and modular models.</p>
        </div>
        <div class="card-meta">
          <span>44 Documents</span>
          <span class="card-btn">Explore Docs →</span>
        </div>
      </a>
    </main>

    <footer class="footer">
      <p>© 2026 West Coast Animal Hospital · 179 Total Documentation Pages · Built with Pagenary static site generator.</p>
    </footer>
  </div>
</body>
</html>
`;

if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'index.html'), portalHtml);
  console.log('Generated root portal at dist/index.html');
}
