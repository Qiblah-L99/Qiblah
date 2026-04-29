# Qiblah

Qiblah is a local mosque and community platform for finding prayer times, Jummah times, services, classes and events. The public site is backed by Supabase and includes admin tools for mosque teams, a super admin area, embeddable widgets, and a TV display screen for digital signage.

Live site: https://qiblah.co.uk

## Main Areas

| Path | Purpose |
|------|---------|
| `/` | Public Qiblah app with mosque profiles, prayer times, services, classes and events |
| `/register/` | Landing page for mosques to register interest |
| `/mosque/` | Mosque admin dashboard |
| `/admin/` | Super admin dashboard |
| `/display/{mosque-slug}` | Live TV display for a mosque |
| `/embed.html` | Embeddable mosque prayer card/widget |
| `/institute/` | Institute profile page |
| `/jumuah/` | Jummah finder page |
| `/morning-adhkar/` | Morning adhkar page |
| `/evening-adhkar/` | Evening adhkar page |
| `/surah-kahf/` | Surah Kahf page |

## Current Features

- Public mosque profiles with prayer times, Jummah times, facilities, services, classes and events.
- Mosque cards use clean mosque icon branding and do not show AM/PM on prayer times.
- Service times display in 12-hour AM/PM format.
- Prayer countdown logic follows the same flow as the local mosque countdown: begins first, then Jamaah.
- Super admin dashboard for managing mosques and core site data.
- Mosque admin dashboard for mosque teams to manage their own profile, prayer timetable, Jummah times, services, announcements, classes/events, embed widgets, TV ticker and display colours.
- Mosque admin stays logged in after refresh unless the user signs out.
- TV display screen with prayer timetable, next salah, sunrise, Jummah, classes/events carousel, ticker messages and live refresh.
- Display settings allow mosque admins to change background, panel, accent/tag and text colours with preview and reset-to-default controls.
- Embed widget includes small card and larger prayer times card options.
- Register page has updated Qiblah branding and a shorter landing-page style layout.

## Data And Refresh

The app uses Supabase REST endpoints directly from the frontend.

The TV display refreshes live mosque data automatically every 5 minutes, including prayer times, Jummah times, classes/events, ticker messages and display colour settings. This avoids needing to refresh the browser manually on digital signage.

Ticker messages and display colour settings are stored in the existing announcements data so mosque admins can manage everything from the same dashboard.

## Supabase And Vercel

Qiblah uses Supabase for the live database and Vercel for website hosting.

Supabase stores the app data:

- Mosques
- Prayer timetables
- Jummah times
- Services
- Announcements
- Classes and events
- Mosque admin PIN records
- TV ticker messages
- TV display colour settings

Vercel serves the website and clean URLs:

- Main site: `https://qiblah.co.uk/`
- Register page: `https://qiblah.co.uk/register/`
- Mosque admin: `https://qiblah.co.uk/mosque/`
- Super admin: `https://qiblah.co.uk/admin/`
- TV display: `https://qiblah.co.uk/display/{mosque-slug}`

Short version: Vercel is the website host, Supabase is the database/backend.

## Mosque Admin

Mosque admin is available at:

```text
https://qiblah.co.uk/mosque/
```

Mosque admins log in with their mosque ID/slug and PIN. After login, refresh keeps them in the dashboard. Pressing sign out clears the saved session. The PIN is not stored locally.

Admin sections include:

- Prayer timetable
- Jummah times
- Mosque profile and facilities
- Services
- Announcements
- Classes and events
- Embed widgets
- TV display preview
- TV ticker
- Display colour settings
- Raspberry Pi/display setup guide

## TV Display

Each mosque can use a live display URL:

```text
https://qiblah.co.uk/display/{mosque-slug}
```

Example:

```text
https://qiblah.co.uk/display/dar-al-arqam
```

This is designed for TV screens and Raspberry Pi kiosk setups. Keep the display page open and it will refresh data automatically.

## Raspberry Pi Display Setup

Recommended approach:

1. Install Raspberry Pi OS.
2. Connect the Pi to the mosque TV.
3. Open Chromium in kiosk mode.
4. Load the mosque display URL.
5. Set the Pi to launch Chromium on startup.

The display URL can also be opened on any browser, smart TV browser, signage player or mini PC.

## Deployment

The project is a static frontend and can be deployed on Vercel, GitHub Pages or another static host. Vercel is the preferred live host because `vercel.json` supports clean routes such as `/mosque/`, `/admin/`, `/register/` and `/display/{mosque-slug}`.

Important files:

| File | Purpose |
|------|---------|
| `index.html` | Main public app |
| `register/index.html` | Register landing page |
| `mosque/index.html` | Mosque admin UI |
| `mosque/admin.js` | Mosque admin logic |
| `admin/index.html` | Super admin dashboard |
| `display.html` | TV display screen |
| `embed.html` | Embeddable widget |
| `CNAME` | Custom domain config |
| `vercel.json` | Routing support for clean URLs |
| `sw.js` | Service worker |
| `manifest.json` | PWA metadata |

## Vercel

1. Connect the GitHub repository to Vercel.
2. Set the production branch to `main`.
3. Keep the output/build settings as a static site unless a build step is added later.
4. Add the custom domain `qiblah.co.uk` in Vercel.
5. Push changes to GitHub; Vercel deploys the latest version automatically.

## GitHub Pages

1. Push changes to the `main` branch.
2. In GitHub, go to Settings -> Pages.
3. Set source to `main` branch and `/ (root)`.
4. Make sure `CNAME` points to `qiblah.co.uk` if using the live domain.

## Notes

- Do not commit private service-role keys.
- The public Supabase anon key is used by the frontend.
- Keep Supabase row-level security and table policies aligned with the admin and public read/write flows.
- When changing display or admin behaviour, test both local file URLs and deployed clean URLs.
