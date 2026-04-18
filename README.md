# MAPL Boys' Tennis Tournament App

Live bracket tracker with real-time sync and coach admin access.

---

## Deploy in 5 steps — follow in order

### Step 1 — Create a GitHub account and upload this code

1. Go to https://github.com and click **Sign up** — create a free account
2. Once signed in, click the **+** icon (top right) → **New repository**
3. Name it `mapl-tennis`, leave it **Public**, click **Create repository**
4. On the next page, click **uploading an existing file**
5. Drag the entire `mapl-tennis` folder contents into the upload area
6. Click **Commit changes**

---

### Step 2 — Create a Supabase account and database

1. Go to https://supabase.com and click **Start your project** — sign up free
2. Click **New project**, give it the name `mapl-tennis`
3. Choose a region closest to you (e.g. US East), set any database password, click **Create new project**
4. Wait ~2 minutes for it to spin up
5. In the left sidebar, click **SQL Editor**
6. Copy the entire contents of `supabase-setup.sql` and paste it into the editor
7. Click **Run** — you should see "Success"
8. In the left sidebar, click **Project Settings** → **API**
9. Copy two values — you'll need them in Step 3:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long string starting with `eyJ...`)

---

### Step 3 — Deploy to Vercel

1. Go to https://vercel.com and click **Sign up** → choose **Continue with GitHub**
2. Authorize Vercel to access your GitHub
3. Click **Add New Project** → find `mapl-tennis` in the list → click **Import**
4. Before clicking Deploy, click **Environment Variables** and add these three:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL from Step 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key from Step 2 |
   | `NEXT_PUBLIC_ADMIN_PASSWORD` | Choose a password for coaches, e.g. `mapl2025` |

5. Click **Deploy** — wait about 1 minute
6. Vercel will give you a URL like `mapl-tennis.vercel.app` — that's your live app!

---

### Step 4 — Test it

1. Open `mapl-tennis.vercel.app` in your browser
2. Open it in a second browser window or on your phone
3. Click **Coach login** (top right), enter your admin password
4. Enter some test player names and generate brackets
5. Enter a score in one window — watch it appear in the other window within a second or two

---

### Step 5 — Share it

- **Public link** (read-only for anyone): `mapl-tennis.vercel.app`
- **Coach login**: click "Coach login" top-right, enter the admin password you set
- Share the URL with parents, players, and spectators — they'll see live updates automatically

---

## Changing the admin password

Go to Vercel → your project → Settings → Environment Variables → edit `NEXT_PUBLIC_ADMIN_PASSWORD` → Redeploy.

## Resetting for a new tournament

In the Supabase SQL editor, run:
```sql
update tournament_state set state = '{"flights": [null, null, null, null], "generated": false}' where id = 1;
```

---

## Need help?

If anything goes wrong at any step, copy the error message and bring it back to Claude — every step is fixable.
