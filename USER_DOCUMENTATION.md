# Optima — User Documentation

**Version:** 1.0  
**Project:** Optima — School Decision Support System  
**Course:** SC2006 Software Engineering, Nanyang Technological University

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Requirements](#2-system-requirements)
3. [Setup Instructions](#3-setup-instructions)
4. [How to Use the System](#4-how-to-use-the-system)
   - 4.1 [Registering an Account](#41-registering-an-account)
   - 4.2 [Logging In](#42-logging-in)
   - 4.3 [Browsing and Searching Schools](#43-browsing-and-searching-schools)
   - 4.4 [Using Quick Filters](#44-using-quick-filters)
   - 4.5 [Setting Preferences and Getting Recommendations](#45-setting-preferences-and-getting-recommendations)
   - 4.6 [Understanding Your Results](#46-understanding-your-results)
   - 4.7 [Finding Nearby Schools](#47-finding-nearby-schools)
   - 4.8 [Viewing a School Profile](#48-viewing-a-school-profile)
   - 4.9 [Saving Schools](#49-saving-schools)
   - 4.10 [Writing and Reporting Reviews](#410-writing-and-reporting-reviews)
   - 4.11 [Admin Moderation](#411-admin-moderation)
5. [Recommendation Flow Summary](#5-recommendation-flow-summary)
6. [Troubleshooting](#6-troubleshooting)
7. [Notes and Limitations](#7-notes-and-limitations)
8. [Conclusion](#8-conclusion)

---

## 1. Project Overview

**Optima** is a web-based school decision support system designed to help Singapore families make informed secondary school choices. Every year, Primary 6 students must select secondary schools through the Ministry of Education (MOE) Secondary 1 Posting Exercise. With over 130 secondary schools in Singapore, each offering a different combination of programmes, CCAs, and subjects, this decision can be overwhelming.

Optima addresses this by providing:

- A **searchable, filterable directory** of all Singapore secondary schools, populated from official MOE data.
- A **personalised recommendation engine** that ranks schools based on your specific must-have requirements and ranked preferences using a transparent scoring algorithm (ROC weighting).
- A **commute estimator** that calculates realistic public transport travel times from your home to each school.
- **School profiles** with detailed information on CCAs, MOE programmes, subjects, distinctive programmes, and community reviews.
- **Community features** including school reviews, saved shortlists, and admin moderation.

---

## 2. System Requirements

Before setting up the project, ensure the following are installed on your machine.

| Requirement | Version | Notes |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | Powers the entire application stack |
| [Node.js](https://nodejs.org/) | v20 or above | Required for running scripts outside Docker |
| [pnpm](https://pnpm.io/installation) | v8 or above | Monorepo package manager |
| A [Supabase](https://supabase.com/) account | Free tier | Handles user authentication |
| A [OneMap](https://www.onemap.gov.sg/apidocs/) account | Free | Optional but recommended for accurate commute data |
| Git | Any recent version | For cloning the repository |

> **Note:** Docker Desktop must be running before you start the application. On macOS, you can verify Docker is running by checking the whale icon in your menu bar.

---

## 3. Setup Instructions

### 3.1 Clone the Repository

Open a terminal and run:

```bash
git clone <repository-url>
cd Optima
```

### 3.2 Install Dependencies

From the project root, install all workspace dependencies:

```bash
pnpm install
```

### 3.3 Configure Environment Variables

The project requires two separate `.env` files — one for the backend API and one for the frontend.

#### Backend API (`apps/api/.env`)

Copy the example file and fill in your values:

```bash
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and set the following:

```env
# Database — already configured for Docker Compose; do not change unless running outside Docker
DATABASE_URL=postgresql://optima:optima@localhost:5433/optima

# Supabase — from https://app.supabase.com → Settings → API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# OneMap — from https://www.onemap.gov.sg/apidocs/
# Optional but required for accurate commute times
ONEMAP_TOKEN=your-onemap-token
```

**Where to find your Supabase values:**
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Open your project → **Settings** → **API**
3. Copy the **Project URL** → paste as `SUPABASE_URL`
4. Copy the **JWT Secret** (under "JWT Settings") → paste as `SUPABASE_JWT_SECRET`

#### Frontend Web App (`apps/web/.env` or root `.env`)

Create a `.env` file at the root of the project (or in `apps/web/`):

```bash
cp .env.example .env   # if an example exists, otherwise create manually
```

Set the following:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://localhost:4000
```

**Where to find your Supabase anon key:**
1. Go to your Supabase project → **Settings** → **API**
2. Copy the **anon / public** key → paste as `VITE_SUPABASE_ANON_KEY`

> **Important:** Make sure that `VITE_API_URL` points to `http://localhost:4000` for local development.

### 3.4 Configure Supabase Authentication

In your Supabase dashboard:

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to `http://localhost:3000`
3. Under **Redirect URLs**, add `http://localhost:3000/reset-password`

This allows password reset emails to work correctly during local development.

### 3.5 Start the Application with Docker Compose

From the project root, run:

```bash
docker compose up --build
```

This command will:
- Build the frontend (React + Vite) and serve it via nginx
- Build and start the backend API (Node.js + Express)
- Start a PostgreSQL database
- Apply the database schema automatically on first run

Once complete, the services will be available at:

| Service | URL |
|---|---|
| Web Application | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Database | `localhost:5433` (for direct DB access tools) |

> **Note:** The first build may take several minutes as Docker downloads base images and installs dependencies. Subsequent starts will be faster due to layer caching.

To stop the application:

```bash
docker compose down
```

### 3.6 Import School Data

After the application is running for the first time, you must import the school dataset from the official Singapore data.gov.sg API. Open a **new terminal** (keep Docker running) and run:

```bash
pnpm --filter @optima/api import:data
```

This will:
- Download official MOE school data (general info, CCAs, subjects, programmes, distinctive programmes)
- Filter to secondary schools only
- Geocode each school's address via OneMap
- Populate the database (~147 schools)

> **This step requires internet access.** The import typically takes 2–5 minutes. You only need to run it once unless the data needs to be refreshed.

If you see `Import Complete` with a school count above 0, the data imported successfully.

### 3.7 Create the First Admin Account

To access the admin moderation panel, one account must be granted the Admin role. The first admin is set up via the `/setup` page.

1. Register a normal account at http://localhost:3000/register
2. Navigate to http://localhost:3000/setup
3. Click **"Claim Admin Role"**
4. You will be automatically redirected to the admin dashboard

> **Note:** Once the first admin exists, this `/setup` page permanently shows "Setup already complete." Additional admins must be promoted by an existing admin through the admin panel.

---

## 4. How to Use the System

### 4.1 Registering an Account

1. Open the application at http://localhost:3000
2. Click **"Get Started"** or navigate to http://localhost:3000/register
3. Enter your **email address**, a **password** (minimum 6 characters), and a **display name**
4. Click **"Create Account"**

Supabase will send a **confirmation email** to the address you provided. You must click the link in that email to verify your account before logging in.

### 4.2 Logging In

1. Navigate to http://localhost:3000/login
2. Enter your registered email and password
3. Click **"Sign In"**

If you forget your password:
1. Click **"Forgot password?"** on the login page
2. Enter your email address and click **"Send reset email"**
3. Check your inbox and click the reset link
4. Enter and confirm your new password on the reset page

### 4.3 Browsing and Searching Schools

After logging in, you are taken to the main **Search page** at `/app/search`.

By default, the page shows all Singapore secondary schools in alphabetical order, paginated 15 per page.

**To search by school name:**
1. Click the search bar at the top of the left panel (labelled "Search schools by name…")
2. Type any part of the school name
3. Results update as you type

**To navigate pages:**
Use the **Previous** and **Next** buttons at the bottom of the school list.

### 4.4 Using Quick Filters

Quick filters are located in the left-side control panel under three sections: **Track**, **CCAs**, and **Programmes**.

These filters let you narrow down schools instantly without entering the full preferences flow.

#### Track Filter

| Filter | What it shows |
|---|---|
| IP Schools | Schools offering the Integrated Programme — students go straight to Junior College without sitting O-Levels |

Click a filter to activate it. Click it again to deactivate.

#### CCA Quick Filters

Pre-set filters for popular CCA categories:

- **Basketball** — schools with a basketball CCA
- **Choir** — schools with a choir CCA
- **NCC** — schools with a National Cadet Corps CCA
- **Debate** — schools with a debate CCA
- **Robotics** — schools with a robotics CCA

#### Programme Quick Filters

Pre-set filters for popular MOE programmes:

- Art Elective Programme
- Music Elective Programme
- Enhanced Art Programme
- Enhanced Music Programme
- Bicultural Studies Programme
- Engineering and Tech Programme and Scholarship

> Multiple quick filters can be combined. For example, you can filter for IP Schools that also offer the Music Elective Programme.

### 4.5 Setting Preferences and Getting Recommendations

The preferences flow generates a personalised ranking of up to 5 schools based on your requirements. Click the **"Set Preferences & Get Recommendations"** button on the left panel to open the modal.

The modal has three steps:

---

#### Step 1 — Home & Commute

1. **Enter your home postal code** (6 digits, e.g. `520123`). The system validates it against OneMap and shows a green tick when it is recognised.
2. **Optionally set a maximum commute time** by ticking "Set max commute as a must-have" and entering a number of minutes (e.g. `45`). Schools exceeding this commute time will be completely excluded from results.

> Leaving the postal code blank is allowed. Without it, commute times cannot be calculated and the commute criterion will not be available for ranking.

---

#### Step 2 — Must-Haves

Must-have constraints are **hard requirements**. A school must satisfy **every** active must-have to appear in your results at all. Schools that fail even one constraint are excluded.

You can set requirements across four categories:

| Category | What it checks |
|---|---|
| **Required CCAs** | The school must offer all selected CCAs |
| **Required Programmes** | The school must offer all selected MOE programmes |
| **Required Subjects / Languages** | The school must offer all selected subjects or languages |
| **Required Distinctive Programmes** | The school must offer all selected distinctive programmes |

Each category has a **search bar** and an **expandable grouped dropdown**. Click a category header to expand it, then tick the items you require.

Selected items appear as blue chips at the top of each section. Click the **×** on a chip to remove it.

> **Tip:** Use must-haves sparingly. The more constraints you set, the fewer schools will qualify. If 0 schools match, the system will suggest which constraint to relax.

> **Important:** A criterion that is set as a must-have cannot also be ranked as a preference in Step 3. This is by design.

---

#### Step 3 — Rank Priorities

Good-to-have criteria are **soft preferences**. They do not eliminate schools — instead, they determine how schools are scored and ranked among the ones that passed Step 2.

1. **Click the criteria buttons** to select which ones matter to you (e.g. Commute, CCAs, Programmes, Subjects, Distinctive Programmes). Selected criteria turn dark blue.
2. **Drag the items** in the ranked list to reorder them from most important (top) to least important (bottom).
3. **Optionally specify desired items** for each criterion you selected. For example, if you ranked CCAs, you can specify which particular CCAs you want — the scoring will then measure how many of your desired CCAs each school offers.

If you rank a criterion without specifying desired items, the system ranks schools by the richness of their offerings (more options = higher score).

---

#### Saving and Applying Preferences

- **"Save default"** — stores your current preferences to your browser so they are pre-filled next time you open the modal.
- **"Reset"** — clears all saved preferences.
- **"Generate Results"** — submits your preferences and computes recommendations.

### 4.6 Understanding Your Results

After generating recommendations, the results panel on the right shows up to **5 ranked schools**.

Each result card shows:

| Element | Meaning |
|---|---|
| **Rank number** (1–5) | Position in the ranking, with 1 being the best match |
| **Overall fit %** | Weighted score across all your ranked criteria (higher = better match) |
| **Score bars** | Per-criterion breakdown showing how well the school scored on each preference |
| **Match counts** | For item-based criteria (e.g. "2 / 5 CCAs matched"), shows exactly how many of your desired items the school offers |
| **Commute time** | Estimated public transport travel time from your home |
| **"ROC ranked" badge** | Confirms that the personalised ranking engine was used |

Click any school card to open its full profile.

> **What does "Overall fit %" mean?** It is not simply "the school offers X% of what you asked for." It is a weighted sum: criteria you ranked higher contribute more to the final score. A score of 78% means the school performed well across your prioritised criteria, weighted by importance.

#### Filter Mode Results

If you set must-have constraints but did not rank any preferences, results appear in **filter mode**. All qualifying schools are listed, sorted by commute time (shortest first), with no ranking scores. You can page through them using the Previous / Next buttons. A "Matches" badge indicates this mode.

#### No Results

If no schools satisfy all your must-have constraints, the system displays:
- Which constraint is the most restrictive (the **bottleneck**)
- Up to 3 actionable suggestions such as: increase the max commute time, remove the rarest required item, or drop the second most restrictive constraint

Click **"Apply"** next to any suggestion to try it immediately.

### 4.7 Finding Nearby Schools

To find schools within a 30-minute commute:

1. Click **"Nearby schools (30 min)"** in the left panel
2. Enter your **6-digit postal code** in the input that appears
3. Click **"Go"**

The system calculates public transport commute times to all schools and returns those reachable within 30 minutes, sorted by travel time ascending.

> **Note:** The nearby postal code is temporary and is not saved to your profile or preferences. If you refresh the page, you will need to re-enter it.

### 4.8 Viewing a School Profile

Click any school card to open its full profile page at `/app/schools/:id`.

The profile is organised into tabs:

| Tab | Contents |
|---|---|
| **Overview** | School highlights, quick stats (CCAs, Programmes, Subjects, Distinctive count), address, contact, website |
| **CCAs** | Full list of all co-curricular activities grouped by category |
| **Programmes** | MOE programmes offered |
| **Subjects** | Full subject offerings |
| **Distinctive** | Distinctive school programmes, grouped by domain |
| **Reviews** | Community star ratings and written reviews |

Use the **back arrow** or your browser's back button to return to the search results at the same scroll position.

### 4.9 Saving Schools

You can bookmark schools to a personal saved list for easy comparison later.

**To save a school:**
1. Open the school's profile page
2. Click the **"Save School"** button (bookmark icon) in the top-right of the profile header
3. The button changes to **"Saved"** with a filled icon

**To view your saved schools:**
1. Click **"Saved"** in the navigation bar
2. All bookmarked schools are listed at `/app/saved`
3. Click any card to open that school's profile

**To unsave a school:**
1. Open the school's profile page
2. Click the **"Saved"** button again to remove it from your list

### 4.10 Writing and Reporting Reviews

#### Writing a Review

1. Open any school profile and scroll to the **Reviews** tab
2. Click **"Write a Review"**
3. Select a star rating (1–5 stars)
4. Write a comment (minimum 5 characters)
5. Click **"Submit"**

Your review is published immediately and visible to other users.

> Each user may submit **one review per school**. Submitting a second review for the same school will result in an error.

> Users whose accounts have been suspended by an admin cannot post reviews.

#### Reporting a Review

If you believe a review violates community guidelines:

1. On the Reviews tab, find the review you want to report
2. Click the **flag icon** on the review card
3. Enter a reason for the report
4. Click **"Submit Report"**

The review will be flagged for admin review. You can only report each review once.

### 4.11 Admin Moderation

This section is only accessible to users with the **Admin** role.

To access the admin panel, click **"Admin"** in the navigation bar, or go to `/app/admin`.

The admin panel has two tabs:

#### Reported Reviews Tab

Shows all reviews that have received at least one report. For each review, the admin can see:
- The review content, rating, and author
- The names of users who reported it and their reasons

Available actions per review:

| Action | Effect |
|---|---|
| **Approve** | Keeps the review visible; dismisses all reports |
| **Reject** | Hides the review from the school profile |
| **Ignore Reports** | Dismisses reports without changing the review's visibility |

#### All Reviews Tab

Shows every review in the system (across all schools), regardless of report status.

#### Banning Users

On any review card, the admin can:
- Click **"Ban User"** to suspend the reviewer's account, preventing them from posting new reviews
- Click **"Unban User"** to restore their access

---

## 5. Recommendation Flow Summary

Understanding how recommendations are generated helps you set preferences more effectively.

**Stage 1 — Must-Have Filtering**

First, the system eliminates any school that fails a hard constraint. This uses AND logic: a school must satisfy every active must-have to proceed. Schools missing even one required CCA, programme, subject, or distinctive programme — or exceeding your maximum commute — are excluded entirely.

**Stage 2 — Scoring and Ranking**

The remaining schools are scored using the **ROC (Rank Order Centroid)** weighting method. Each criterion you ranked receives a weight based on its position:

- The criterion ranked **1st** (most important) receives the **largest weight**
- The criterion ranked **last** receives the **smallest weight**
- All weights sum to exactly 1.0

Each school is scored 0–100% on every ranked criterion:

- **Commute:** Schools closer to your home score higher. Schools at or under 10 minutes score near 100%; schools at your maximum commute score near 0%. Each public transport transfer deducts a small penalty.
- **CCAs / Programmes / Subjects / Distinctive:** The fraction of your desired items that the school offers (e.g. 3 out of 5 desired CCAs = 60%). If you did not specify desired items, schools are scored by the richness of their offerings relative to other schools.

The **overall score** is the weighted sum of all criterion scores. The top 5 schools by overall score are returned.

---

## 6. Troubleshooting

### The application does not start

- Ensure **Docker Desktop is running** before running `docker compose up --build`
- Check that ports **3000**, **4000**, and **5433** are not occupied by other applications
- Try rebuilding from scratch: `docker compose down && docker compose up --build`

### The website is blank or shows an error about the API

- Verify `VITE_API_URL=http://localhost:4000` is set in your `.env` file
- Confirm the API container is running: `docker compose ps` should show `optima-api-1` as `Up`
- Check API logs: `docker compose logs api`

### No schools appear in the search results

You have not imported the school data yet. Run:

```bash
pnpm --filter @optima/api import:data
```

Ensure Docker containers are running when you execute this command.

### Login fails or "Invalid credentials" error

- Confirm you verified your email address by clicking the link in the Supabase confirmation email
- Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend `.env` file match your Supabase project
- Ensure `SUPABASE_JWT_SECRET` in `apps/api/.env` matches your Supabase project's JWT secret

### Password reset email is not working

- In your Supabase dashboard, go to **Authentication → URL Configuration**
- Ensure the **Site URL** is `http://localhost:3000` and `http://localhost:3000/reset-password` is listed under **Redirect URLs**

### Commute times are missing or show as estimated

- Commute data requires a valid `ONEMAP_TOKEN` in `apps/api/.env`
- Without a token, the system falls back to a Haversine straight-line distance estimate (marked as "estimated" in results)
- To get a token, register at [https://www.onemap.gov.sg/apidocs/](https://www.onemap.gov.sg/apidocs/) and use Option 1 (static token) in the env file

### IP filter returns 0 schools

The school data needs to be imported (or re-imported). Run `pnpm --filter @optima/api import:data` to populate the `isIp` field for all schools.

### Admin panel is not accessible

- Your account must have the Admin role. Navigate to `/setup` to claim the first admin role
- If another admin already exists, ask them to promote your account via the admin panel

### Changes to source files are not reflected in the running app

The Docker setup uses pre-compiled static assets. After editing any source file, you must rebuild:

```bash
docker compose down && docker compose up --build
```

---

## 7. Notes and Limitations

- **Commute accuracy:** Real commute times are retrieved from the OneMap routing API. If OneMap is unavailable or unconfigured, the system falls back to a straight-line distance estimate using the Haversine formula. Estimated commutes are marked with an indicator in the UI and may differ from actual transit times.

- **School data freshness:** School data is sourced from the official Singapore Government data.gov.sg MOE datasets. Data reflects the most recent import. To refresh the data, re-run `pnpm --filter @optima/api import:data`.

- **Commute calculation requires a home postal code:** If no postal code is provided, commute cannot be scored or used as a must-have. All other criteria (CCAs, programmes, subjects, distinctive) remain available without a postal code.

- **Maximum 5 recommendations:** In recommendation mode, only the top 5 schools by weighted score are returned. Filter and browse modes return all matching schools paginated.

- **One review per user per school:** The system enforces a unique constraint; submitting a second review for the same school returns an error.

- **Internet access required for certain features:** School data import, OneMap commute lookups, and Supabase authentication all require internet connectivity.

- **The `/setup` page can only be used once:** Once the first admin has been created, the setup page permanently shows "Setup complete." It cannot be used to create additional admins.

---

## 8. Conclusion

Optima provides a structured, data-driven approach to secondary school selection in Singapore. By combining official MOE school data with a personalised ranking engine, interactive filters, community reviews, and real-world commute calculations, it gives families a clearer picture of which schools best match their child's needs and their family's priorities.

The system is designed to be transparent — all ranking scores are shown with a per-criterion breakdown, so users can understand exactly why a school was recommended. The must-have filtering stage ensures that hard requirements are never compromised, while the ROC-weighted ranking ensures that soft preferences are respected in proportion to how important the user declared them to be.

We hope Optima makes this important decision a little easier.
