# Putting the site online

Two things are covered here:

1. **[Getting it live the first time](#part-1--the-first-time)** — about 20 minutes
2. **[Publishing changes afterwards](#part-2--every-time-you-change-something)** — about 30 seconds each time
3. **[Putting your own domain on it](#part-3--your-own-domain)** — optional, about 20 minutes plus waiting

---

## How this works, in one paragraph

Your project is a folder of source files. It isn't a website yet — a browser can't read
`.js` files with imports and turn them into a game on its own. `npm run build` compiles
everything into a `dist/` folder, which *is* a plain website.

You will **not** be building and uploading that folder by hand. Instead you push your
source code to GitHub, and a robot on GitHub's servers runs `npm run build` for you and
publishes the result. That robot is already set up — it's the file
`.github/workflows/deploy.yml`. You never have to touch it.

So the whole job is: get your code onto GitHub once, then tell GitHub to start the robot.

---

## Part 1 — the first time

### Step 1: Create the repository on GitHub

Go to [github.com/new](https://github.com/new) and fill in:

| Field | What to put |
|---|---|
| Repository name | `personal-webpage` |
| Description | `Personal Webpage` (optional, shows on your profile) |
| Public / Private | **Public** |
| Add a README | **Leave unticked** |
| .gitignore / licence | **Leave as None** |

**The name has to match the project's `SITE_BASE` setting.** GitHub publishes a repo
named `personal-webpage` to `https://marines310.github.io/personal-webpage/` — inside a
subfolder named after the repo. `vite.config.js` is already set to `/personal-webpage/`
to match. If you decide on a different name, change that setting to match it, or the page
will load blank.

Leave the tickboxes alone — if GitHub creates a README for you, your first push will be
rejected for a reason that's annoying to untangle.

Click **Create repository**. You'll land on a page of setup instructions. Ignore them,
they don't quite match what we're doing.

### Step 2: Check you have the tools

Open Terminal and run:

```bash
git --version
```

If you get a version number, skip ahead. If you get a popup offering to install
developer tools, accept it and wait — that's macOS installing git for you.

### Step 3: Point Terminal at your project

```bash
cd
```

Type `cd`, then a space, then **drag the `mike-portfolio-v1` folder from Finder onto the
Terminal window** and press Enter. Dragging pastes the path correctly, which saves
fighting with the spaces in it.

Check you're in the right place:

```bash
ls
```

You should see `index.html`, `package.json`, `src`, `public`. If you don't, you're in the
wrong folder — try the drag again.

### Step 4: Send the code to GitHub

Run these one at a time. If it's your first time using git, the first two lines tell it
who you are; it only needs telling once, ever.

```bash
git config --global user.name "Mike"
git config --global user.email "skhylee0416@gmail.com"

git init
git add .
git commit -m "Interactive driving portfolio"
git branch -M main
git remote add origin https://github.com/marines310/personal-webpage.git
git push -u origin main
```

What these do, briefly:

- `git init` — start tracking this folder
- `git add .` — mark every file to be included
- `git commit` — save a snapshot, with a note describing it
- `git branch -M main` — name the main line of work `main`
- `git remote add origin …` — record where on GitHub this belongs
- `git push` — upload it

A browser window will open asking you to sign in to GitHub. Do that, and the push
completes. Refresh your repo page and your files will be there.

> **If it asks for a password in the Terminal and rejects the right one:** GitHub stopped
> accepting account passwords over the command line. Install
> [GitHub CLI](https://cli.github.com), run `gh auth login`, follow the prompts, then
> re-run the `git push` line.

### Step 5: Turn on Pages

In your repo on GitHub: **Settings** → **Pages** (left sidebar).

Under **Build and deployment** → **Source**, choose **GitHub Actions**.

This is the step people miss. The default is "Deploy from a branch", which would try to
serve your raw source files instead of the built site — you'd get a blank page and no
obvious reason why.

### Step 6: Watch it build

Click the **Actions** tab at the top of your repo. You'll see a run in progress with a
spinning amber dot. It takes 1–2 minutes and turns into a green tick.

Then open:

**https://marines310.github.io/personal-webpage/**

Note the trailing slash. Without it GitHub usually redirects you correctly, but not
always.

The first time only, it can take a few extra minutes to become reachable. If you get a
404 straight away, wait five minutes and try again before assuming something's wrong.

---

## Part 2 — every time you change something

This is the loop from here on.

**1. Make your change and check it locally.**

```bash
npm run dev
```

Open the address it prints (`http://localhost:3000`) and confirm you're happy. `Ctrl+C`
in Terminal to stop it.

**2. Publish.**

```bash
git add .
git commit -m "Redrew the map"
git push
```

The message in quotes is a note to your future self about what changed. It can be
anything; it's worth making it descriptive.

**3. Wait about 90 seconds**, then reload the site.

That's genuinely it. Pushing to `main` starts the robot automatically — there's no
separate "deploy" step to remember, and you never touch the `dist` folder.

### If the site still looks old

Almost always one of these two:

**Your browser cached it.** Hard-refresh: `Cmd + Shift + R`. If you want to be certain,
open the site in a private window — that can't be serving you an old copy.

**The build failed.** Check the **Actions** tab. A red ✗ means the robot hit an error and
kept the previous version online rather than publishing a broken one. Click into the red
run and open the step that failed; the error is usually the last few lines. A site that
doesn't update is nearly always a failed build, not a lost push.

### A useful habit

`npm run build` locally before you push. It runs the same compile the robot will run, so
if it's going to fail you find out in five seconds rather than two minutes.

---

## Part 3 — your own domain

`marines310.github.io` is a perfectly respectable address. A custom domain is worth it if
you're putting this on a resume or in an email signature and want it to read as yours.

### Choosing a name

Shorter is better, and you'll be reading it aloud to people, so avoid hyphens and
creative spellings. `.com` is still the one people assume; `.dev` and `.io` are common for
this kind of site. Something like `mikelee.dev` or `skhylee.com` — worth checking a few
options, as good `.com` names are mostly gone.

### Where to buy

| | Cost per year | Worth knowing |
|---|---|---|
| **[Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)** | ~$10.44 for `.com` | Sells at cost — no markup, and no first-year discount that quietly triples later. Cheapest over time. Slightly more setup: you have to move the domain's nameservers to Cloudflare. |
| **[Namecheap](https://www.namecheap.com)** | ~$6.48 first year, ~$14.58 after | Easier for a first purchase, everything in one place. You pay a few dollars a year for that. |

Prices checked July 2026. Either is fine — the difference is about five dollars a year.
**Whichever you pick, decline the add-ons at checkout.** Domain privacy should be free and
usually is; you don't need their hosting, email, or SSL, because GitHub gives you HTTPS
free.

### Pointing it at your site

Three halves, if you'll forgive the arithmetic: change one line in the project, set up
DNS, then tell GitHub to accept the domain.

**First — change `SITE_BASE`.** This is the step that catches people out. A custom domain
serves your site from the *root* (`https://yoursite.com`), not from
`https://yoursite.com/personal-webpage/`. So the subfolder prefix has to come off.

At the top of `vite.config.js`:

```js
const SITE_BASE = '/'        // was '/personal-webpage/'
```

Then push as usual. Do this at the same time as the DNS setup — in the gap between the
two, one of the addresses will be broken whichever order you pick, and it's brief.

> Note this means the old `marines310.github.io/personal-webpage/` address stops working
> once the domain is live. That's expected: you'll have a better address by then.

**Second — at your registrar**, find the DNS settings and add these five records.
Delete any placeholder or "parking" records they created for you first.

| Type | Name / Host | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `marines310.github.io` |

`@` means the bare domain (`yoursite.com`). The four A records are GitHub's servers — all
four, for redundancy. The CNAME makes `www.yoursite.com` work too.

Note the trailing dot: enter the CNAME value as `marines310.github.io` — some registrars
add the dot themselves, which is fine.

**Third — on GitHub:** **Settings** → **Pages** → **Custom domain**, type your domain,
click **Save**. GitHub will check the DNS. This can fail for the first hour or so purely
because DNS changes take time to spread; that's normal, not a mistake on your part.

Once the check passes, tick **Enforce HTTPS**. It may be greyed out at first while a
certificate is issued for you — check back in an hour.

**Timing:** usually 15 minutes to an hour. Occasionally up to 24. Nothing is broken during
the wait.

### One extra file, as insurance

Once the domain is working, create a file called `CNAME` (no extension) inside the
`public/` folder, containing just your domain:

```
yoursite.com
```

Then `git add . && git commit -m "Add CNAME" && git push`.

GitHub stores your custom domain in its settings, but that setting has been known to reset
itself when a deployment replaces the site. This file makes the domain part of your code,
so it survives.

---

## When something goes wrong

**Blank page, no error.** Almost always `SITE_BASE` at the top of `vite.config.js` not
matching where the site actually lives. For a repo named `personal-webpage` with no custom
domain it must be `'/personal-webpage/'`. Open the browser console (`Cmd + Option + J`) —
a wall of 404s for missing `/assets/…` files confirms it.

**Site loads but the buildings are plain shapes.** The `.glb` model files didn't get
uploaded. Run `git status` — if it lists things in `public/models/`, they were never
committed. `git add public/models` and push.

**Buildings load but are white.** The texture file is missing or misnamed. This one is
sneaky: GitHub's servers treat `Textures/colormap.png` and `textures/colormap.png` as
different files, while your Mac treats them as the same. So a capitalisation slip works
perfectly on your machine and fails only once it's live. The folder must be
`public/models/Textures/` with a capital T.

**Actions tab shows a red ✗.** Click the failed run, then the failed step. The real error
is usually in the last handful of lines. If it mentions `npm ci`, make sure
`package-lock.json` was committed — the robot needs it.

**Everything looks right but the URL 404s.** Check **Settings → Pages** still says
**Source: GitHub Actions**, and that your repo is **Public**. Pages on a private repo
needs a paid plan.

---

## Worth knowing

- Your map editor gets published too, at
  `marines310.github.io/personal-webpage/map-editor.html`. Nothing
  links to it, so nobody will stumble across it, and it's occasionally handy to be able to
  open it from any machine.
- Everything you push is public, including your commit messages and your email address in
  the commit history. Nothing in this project is sensitive, but it's worth knowing.
- Deleting the repo takes the site down instantly. Renaming it also breaks the URL.
