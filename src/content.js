/**
 * ===========================================================================
 * YOUR WORDS. THIS IS THE ONLY FILE YOU NEED TO EDIT TO CHANGE THEM.
 * ===========================================================================
 *
 * Everything a visitor reads when they drive into one of the islands is here.
 * Nothing in this file is game code - no 3D, no physics, no maths. Change the
 * text, save, and it is on the site the next time you push.
 *
 * There are five panels, one per island, in the order below. Each has a
 * `title` (the heading) and a `body` (everything under it).
 *
 * ---------------------------------------------------------------------------
 * THE THREE RULES
 * ---------------------------------------------------------------------------
 *
 * 1. DON'T TOUCH THE BACKTICKS. Every body starts with ` and ends with `.
 *    Type freely between them; delete one and the site will not build.
 *
 * 2. WRAP EACH PARAGRAPH IN <p>...</p>, and each bullet in <li>...</li>
 *    inside a <ul>...</ul>. That is all the HTML you need:
 *
 *        <p>A paragraph.</p>
 *        <p><strong>Bold bit</strong> — then normal text.</p>
 *        <ul>
 *          <li>A bullet.</li>
 *          <li>Another bullet.</li>
 *        </ul>
 *
 * 3. A LITERAL & SHOULD BE WRITTEN &amp;  - so "Ventures &amp; Experience".
 *    It will display as a normal &. (An & on its own usually works, but this
 *    is the correct form and never surprises you.)
 *
 * Two characters to avoid typing raw inside a body, because they mean
 * something to JavaScript: a backtick ` and the pair ${ . Ordinary
 * apostrophes, quotes, em dashes and accents are all completely fine.
 *
 * ---------------------------------------------------------------------------
 * ADDING OR REMOVING A WHOLE PANEL
 * ---------------------------------------------------------------------------
 *
 * Each panel's `island` has to match an island in `src/world/mapData.js` -
 * that is what decides WHERE on the map it appears. Delete a panel here and
 * the island stays, just with nothing to read on it. To add a sixth panel you
 * need a sixth island, which is a map change rather than a text one.
 * ===========================================================================
 */

/** Where the "Get In Touch" links point. */
export const LINKS = {
  email: 'skhylee0416@gmail.com',
  linkedin: 'https://www.linkedin.com/in/mikeshlee',
  github: 'https://github.com/marines310',

  // Put a real address here and the "Read the blog" link appears on the
  // Writing island. Leave it as it is and that panel simply has no link -
  // better than a live link to a domain nobody owns, which is what the
  // published site had until 13 August.
  blog: 'https://your-blog-url.com'
}

/** The address in `blog` above that means "there isn't one yet". */
export const BLOG_PLACEHOLDER = 'https://your-blog-url.com'

/**
 * The "Read the blog" line, or nothing at all.
 *
 * Checks against the placeholder rather than trying to recognise a
 * "real-looking" URL, which would eventually reject a good one.
 */
export function blogLink(url) {
  if (!url || url === BLOG_PLACEHOLDER) return ''
  return `<p><a href="${url}" target="_blank" rel="noopener">Read the blog →</a></p>`
}

export const ZONE_CONTENT = [
  // -------------------------------------------------------------------------
  {
    island: 'about',
    title: "'Mike' Sukhyung Lee, PMP",
    body: `
      <p><strong>Product &amp; Venture Strategy Leader</strong> — Financial Services, AI</p>
      <p>New Business Building · GTM · 0→1 Initiatives · Partnerships · Global Expansion</p>
      <p>San Francisco, CA</p>
      <p>AI product, project management, and corporate innovation leader with 10+ years of experience building new ventures, digital products, and operating models across financial services, AI, e-commerce, healthcare, defense, and corporate venture environments.</p>
      <p>Currently leading project management standards and deputy operations for Hanwha AI Center, supporting AI initiatives across Hanwha's financial subsidiaries.</p>
    `
  },

  // -------------------------------------------------------------------------
  {
    island: 'projects',
    title: 'Ventures & Experience',
    body: `
      <ul>
        <li><strong>Head of PMO, Hanwha AI Center</strong> (2025–Present) — Leading New Product Development practice; deputy for operations overseeing a $20M budget; scaled to 6–10 projects/year targeting an $800M market (4x throughput).</li>
        <li><strong>Interim COO, Hanwha AI Center</strong> (Jan–Jun 2025) — Stood up a new joint AI R&amp;D center across Hanwha's financial subsidiaries; grew the management team 4x; oversaw a $12M annual budget.</li>
        <li><strong>Head of Ops &amp; PMO, Hanwha Life Digital Lab (DREAMPLUS SF)</strong> (2019–2024) — Founding member; developed new business opportunities in healthcare, cyber, investments, and mobility; bridged SF and Korea HQ.</li>
        <li><strong>DREAMPLUS Alliance</strong> — Built a network of 13 accelerators and VCs across 12 nations to help startups expand into new markets.</li>
        <li><strong>Republic of Korea Air Force</strong> — First Lieutenant, Command Staff &amp; Crisis Action Group (2010–2013).</li>
      </ul>
    `
  },

  // -------------------------------------------------------------------------
  {
    island: 'skills',
    title: 'Skills & Certifications',
    body: `
      <ul>
        <li>Agile Project Management &amp; Administration</li>
        <li>Project Management Professional (PMP)®</li>
        <li>Professional Scrum Master™ I (PSM I)</li>
        <li>Generative AI &amp; Prompt Engineering for Project Managers</li>
        <li>0→1 Venture Building, GTM, Partnerships, Global Expansion</li>
        <li>Bilingual — Korean &amp; English (native/bilingual)</li>
      </ul>
    `
  },

  // -------------------------------------------------------------------------
  {
    island: 'blog',
    title: 'Writing',
    body: `
      <p>Notes on AI product strategy, venture building, and lessons from launching innovation centers.</p>
      ${blogLink(LINKS.blog)}
    `
  },

  // -------------------------------------------------------------------------
  {
    island: 'contact',
    title: 'Get In Touch',
    body: `
      <p>I'd love to hear from you!</p>
      <p><a href="mailto:${LINKS.email}">${LINKS.email}</a></p>
      <p><a href="${LINKS.linkedin}" target="_blank" rel="noopener">LinkedIn</a></p>
      <p><a href="${LINKS.github}" target="_blank" rel="noopener">GitHub</a></p>
    `
  }
]
