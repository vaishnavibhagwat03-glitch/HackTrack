# Deploying HackTrack with Docker

This guide goes from "what is Docker?" to HackTrack running on a public HTTPS address. Each step says **what to do** and **why**, so you can explain it as well as run it.

Contents

1. [The idea in five words](#1-the-idea-in-five-words)
2. [How HackTrack is packaged](#2-how-hacktrack-is-packaged)
3. [Part A: run it with Docker on your own PC](#3-part-a-run-it-with-docker-on-your-own-pc)
4. [Part B: put it on the internet](#4-part-b-put-it-on-the-internet)
5. [Day-to-day commands](#5-day-to-day-commands)
6. [When something goes wrong](#6-when-something-goes-wrong)
7. [Security notes](#7-security-notes)
8. [Optional: Sign in with Google](#8-optional-sign-in-with-google)

---

## 1. The idea in five words

| Word | Meaning | In HackTrack |
|---|---|---|
| **Image** | A packaged, read-only copy of a program plus everything it needs to run (OS libraries, runtime, files). Built from a recipe called a **Dockerfile**. | Four images: website, C++ client, server, proxy. |
| **Container** | A running instance of an image, isolated from the rest of the machine. You can delete and recreate it at any time. | Four containers, one per image. |
| **Compose** | A file (`compose.yaml`) that describes several containers and how they connect, so one command starts them all. | `docker compose up` starts the whole system. |
| **Volume** | A storage area that lives outside the container, so data survives when a container is rebuilt. | The SQLite database and the HTTPS certificates. |
| **Reverse proxy** | A program at the front door that receives every request and forwards it to the right container. | Caddy: `/api/...` goes to the C++ client, everything else to the website. |

Why bother? Without Docker, whoever runs HackTrack needs Node.js, CMake, Ninja and g++ installed, in the right versions. With Docker they need only Docker. The C++ client is compiled **inside** its image, on Linux, the same way every time.

## 2. How HackTrack is packaged

```
                        internet
                           │  ports 80 / 443 (the only open ports)
                ┌──────────▼──────────┐
                │  proxy  (Caddy)     │  HTTPS certificates
                └───┬─────────────┬───┘
         /api/...   │             │   everything else
        ┌───────────▼───┐   ┌─────▼──────────┐
        │ client (C++)  │   │ web (Next.js)  │
        │ :8080 bridge  │   │ :3000          │
        └───────┬───────┘   └────────────────┘
                │ HTTP/JSON
        ┌───────▼───────┐
        │ server (Node) │
        │ :4000         │──► volume: hacktrack-data/hacktrack.db
        └───────────────┘
```

The architecture is the same as on your laptop: the website still never talks to the server, and every request still goes through the C++ client. What changes:

- **One address.** On a laptop the browser calls `http://localhost:8080/api` directly. On a deployment it calls `/api` on the same address the page came from, and Caddy forwards it to the C++ client. The browser never needs to know port 8080 exists.
- **Containers find each other by name.** The C++ client reaches the server at `server:4000`; Caddy reaches the client at `client:8080`. Compose creates a private network where each service name works like a hostname.
- **Only the proxy is exposed.** The server, the C++ client and the website have no public ports.

### The files

| File | What it does |
|---|---|
| [`compose.yaml`](compose.yaml) | Lists the four services, the order they start in (each waits for the one before it to report healthy), and the volumes. |
| [`Dockerfile`](Dockerfile) | Website. Stage 1 installs packages, stage 2 runs `next build`, stage 3 keeps only the small standalone server (`server.js`). |
| [`hacktrack-client/Dockerfile`](hacktrack-client/Dockerfile) | C++ client. Stage 1 compiles it with g++ and CMake **and runs the unit tests**: if a test fails, the image is not built. Stage 2 keeps only the `hacktrack` program. |
| [`server/Dockerfile`](server/Dockerfile) | Node server. Stores the database at `/data/hacktrack.db` on a volume. |
| [`Caddyfile`](Caddyfile) | The proxy's two routing rules. |
| [`.env.example`](.env.example) | The settings you fill in: admin password and site address. Copy it to `.env`. |
| [`.dockerignore`](.dockerignore) | Files never sent into an image (`node_modules`, build output, the local database, `.env`). |
| [`scripts/smoke-test.sh`](scripts/smoke-test.sh) | Checks a running deployment end to end: pages, C++ client, server, database, passwords. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | On every push, GitHub builds everything on Linux, runs all tests, starts the Docker system and runs the smoke test. |

**Multi-stage builds**, used in the website and C++ Dockerfiles, are worth understanding: the compiler and build tools exist only in the first stage. The final image copies just the result, so it is smaller and has fewer tools an attacker could use.

**Health checks.** Each Dockerfile has a `HEALTHCHECK` line, a command Docker runs every 10 seconds to ask "are you working?". Compose uses these to start things in order: the C++ client starts only after the server is healthy, and the proxy starts only after the client and website are healthy.

---

## 3. Part A: run it with Docker on your own PC

Do this first. It shows you how everything fits together before a cloud server is involved.

### A1. Install Docker Desktop (Windows)

1. Download Docker Desktop from <https://www.docker.com/products/docker-desktop/>.
2. Run the installer and keep **"Use WSL 2"** ticked. WSL 2 is the small Linux system Docker uses on Windows; the installer sets it up.
3. Restart the PC when asked, then open Docker Desktop and wait until it says **Engine running**.
4. Check it in a terminal:
   ```bash
   docker --version
   docker compose version
   ```

### A2. Create your settings file

In the project folder:

```bash
cp .env.example .env
```

Open `.env` and set a password for the admin account:

```ini
HACKTRACK_ADMIN_PASSWORD=pick-something-long-here
SITE_ADDRESS=:80
```

*Why:* the normal demo password `admin123` is printed in the README, so on any shared deployment the admin gets its own password. `.env` is in `.gitignore`, so it is never committed.

The password is used **when the database is created**. Changing it later in `.env` does nothing until you re-seed (section 5).

### A3. Build and start

```bash
docker compose up -d --build
```

- `up` creates and starts the containers.
- `--build` builds the images first. The first build takes 5–10 minutes (it compiles the C++ client and the website); later builds reuse cached steps and are much faster.
- `-d` (detached) runs everything in the background and gives you the terminal back.

Watch it come up:

```bash
docker compose ps
```

Wait until `server`, `client` and `web` say `(healthy)` and `proxy` says `Up`.

### A4. Open it

Go to <http://localhost>. Port 80 is the default, so there is no `:3000`.

- Sign in as the demo judge or participant with one click.
- Sign in as admin by typing `admin@hacktrack.dev` and the password from `.env`. The admin one-click card is hidden on Docker builds because its password is private.

### A5. Run the smoke test

In Git Bash, from the project folder:

```bash
bash scripts/smoke-test.sh http://localhost
```

You should see `All checks passed.` Each line says which part of the system it checked.

### A6. Stop it

```bash
docker compose down        # stops and removes the containers; the database volume is kept
```

---

## 4. Part B: put it on the internet

You need a computer that is always on and has a public IP address: a **virtual private server (VPS)**. HackTrack runs it with the same `compose.yaml`.

### B1. Get a server

What to ask for:

| Setting | Choose |
|---|---|
| Operating system | **Ubuntu 24.04 LTS** |
| Size | **2 GB RAM** or more (1 GB works only with swap, see B3) |
| Disk | 20 GB or more |
| Open ports / firewall | **22** (SSH), **80** (HTTP), **443** (HTTPS) |
| Login | SSH key (preferred) or password |

Student-friendly options (check each one's current terms):

- **Microsoft Azure for Students:** free credit with a university email, no credit card. Create a *Virtual Machine*.
- **GitHub Student Developer Pack:** includes cloud credit, for example DigitalOcean. Create a *Droplet*.
- **Oracle Cloud Free Tier:** "Always Free" virtual machines; needs a card for verification.

When the server is created, note its **public IP address**, for example `203.0.113.7`. The rest of this guide uses that example; replace it with yours.

> In Azure, ports are opened under the VM's **Networking** settings (add inbound rules for 80 and 443). In DigitalOcean they are open by default.

### B2. Connect to it

From Windows Terminal or Git Bash on your PC:

```bash
ssh azureuser@203.0.113.7      # the username depends on the provider: azureuser, root, ubuntu…
```

Everything from here runs **on the server**, inside this SSH session.

### B3. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sudo sh     # Docker's official install script
sudo usermod -aG docker $USER                   # let your user run docker without sudo
exit                                            # log out…
```

…then `ssh` in again so the group change applies, and check:

```bash
docker compose version
```

**Only on a 1 GB server**, add 2 GB of swap so the website build does not run out of memory:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### B4. Get the code

```bash
git clone https://github.com/vaishnavibhagwat03-glitch/HackTrack.git
cd HackTrack
```

### B5. Create the settings file

```bash
cp .env.example .env
openssl rand -base64 18        # prints a strong random password; copy it
nano .env                      # paste it as HACKTRACK_ADMIN_PASSWORD, keep SITE_ADDRESS=:80
```

In `nano`: save with **Ctrl+O, Enter**, exit with **Ctrl+X**. Keep the password somewhere safe; it is the admin login.

### B6. Start it

```bash
docker compose up -d --build
docker compose ps              # wait for (healthy)
bash scripts/smoke-test.sh     # run on the server itself; checks http://localhost
```

Now open `http://203.0.113.7` in your browser. HackTrack is on the internet, over plain HTTP.

### B7. Turn on HTTPS

Browsers mark plain HTTP as "Not secure". Caddy gets a free certificate from Let's Encrypt automatically. All it needs is a **name** instead of a bare IP address. Two ways to get one:

**Option 1, no domain needed (sslip.io).** `sslip.io` is a free service where any name containing an IP address points to that IP. Write the IP with dashes:

```ini
SITE_ADDRESS=203-0-113-7.sslip.io
```

**Option 2, your own domain.** At your domain registrar, add an **A record** pointing, for example, `hacktrack.yourdomain.com` to `203.0.113.7`. Wait for it to resolve (`ping hacktrack.yourdomain.com` shows your IP), then:

```ini
SITE_ADDRESS=hacktrack.yourdomain.com
```

Either way, edit `.env` and recreate the proxy:

```bash
nano .env
docker compose up -d           # only the proxy changes, so only it restarts
docker compose logs -f proxy   # watch for "certificate obtained successfully", then Ctrl+C
```

Open `https://203-0-113-7.sslip.io` (or your domain). Check it end to end:

```bash
bash scripts/smoke-test.sh https://203-0-113-7.sslip.io
```

### B8. Before you share the link

- [ ] Smoke test passes on the HTTPS address
- [ ] Admin signs in with the `.env` password; `admin123` is refused
- [ ] Submission deadline is where you want it: **Administration → Event**. The demo data sets the deadline to 2 days after the database was created.
- [ ] Optional: judges and scores filled in with the C++ demo mode (section 5)
- [ ] Real event, not a demo? Switch the demo accounts off (section 7), after the C++ demo mode if you use it

---

## 5. Day-to-day commands

Run these in the project folder on the server.

| Task | Command |
|---|---|
| See what is running | `docker compose ps` |
| Follow all logs (Ctrl+C to stop following) | `docker compose logs -f` |
| Logs of one part | `docker compose logs -f client` (or `server`, `web`, `proxy`) |
| Restart one part | `docker compose restart client` |
| Stop everything (data kept) | `docker compose down` |
| Start again | `docker compose up -d` |

**Deploy a new version.** Make changes on your PC, commit, push to GitHub. Then, on the server:

```bash
git pull
docker compose up -d --build      # rebuilds only images whose files changed
```

**Fill in judge assignments and scores (C++ demo mode).** This runs a second copy of the C++ program, in `--demo` mode, against the same server:

```bash
docker compose run --rm client --demo --server server:4000
docker compose restart client     # the bridge reloads its cache
```

**Run the benchmark (C++ bench mode):**

```bash
docker compose run --rm client --bench
```

**Reset the demo data.** This wipes everything users have done, recreates the demo event with a fresh deadline (2 days from now), and applies the admin password currently in `.env`:

```bash
docker compose stop server client
docker compose run --rm server node src/seed.mjs
docker compose up -d
```

**Back up the database:**

```bash
docker compose cp server:/data/hacktrack.db ./hacktrack-backup.db
```

**Delete everything, including the database** (careful):

```bash
docker compose down -v            # -v also deletes the volumes
```

---

## 6. When something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| `Set HACKTRACK_ADMIN_PASSWORD in .env` | No `.env`, or the line is missing | `cp .env.example .env` and fill it in |
| Build stops at `RUN npm run build` with "killed" or exit code 137 | The server ran out of memory | Add swap (B3), or use a 2 GB server |
| Build stops in the C++ stage | A compile error or a failing unit test | Read the lines above the error: `[FAIL] …` names the test |
| `docker compose ps` shows `unhealthy` | That part is not answering its health check | `docker compose logs <service>` |
| Sidebar shows **C++ CLIENT OFFLINE**, or pages show "Request failed (502)" | The `client` container is down or unhealthy, so Caddy has nowhere to send `/api` | `docker compose logs client`, then `docker compose restart client` |
| Browser cannot connect at all | Ports 80/443 closed in the cloud firewall | Open them in the provider's network settings (B1) |
| HTTPS certificate not issued | DNS not pointing at the server yet, or port 80 closed | `docker compose logs proxy`; check `ping your-name` shows your IP |
| `bind: address already in use` on port 80 | Another web server is running (often Apache or nginx) | Stop it: `sudo systemctl disable --now apache2` (or `nginx`) |
| Admin password from `.env` is refused | The database was created before you set it | Reset the demo data (section 5) |
| "Too many failed sign-ins" | 5 wrong passwords in 15 minutes from that address | Wait 15 minutes, or `docker compose restart client` |
| "Demo accounts are switched off" | `HACKTRACK_DEMO_LOGINS=off` in `.env` | Set it to `on` and `docker compose up -d --build` |
| Submissions locked ("deadline passed") | The demo deadline is 2 days after seeding | Move it in **Administration → Event**, or reset the demo data |

---

## 7. Security notes

- **Only Caddy is reachable from the internet.** The Node server and the C++ client listen only on Compose's private network.
- **The admin password is private** (`.env`, never committed). The judge and participant demo accounts keep their published passwords on purpose, so visitors can try the site. Anyone can also create a participant account.
- **Demo accounts can be switched off.** Their passwords are public, so on an open server anyone could sign in as the demo judge and submit scores. For a real event, put `HACKTRACK_DEMO_LOGINS=off` in `.env` and run `docker compose up -d --build`. The server then refuses the demo passwords (at sign-in and sign-up) and the sign-in page hides the demo cards. The C++ demo mode signs in as the demo judges, so run it before switching off. `on` brings everything back; no data is deleted.
- **Repeated wrong passwords are locked out by the C++ client.** After 5 wrong passwords for one email from one address (or 20 for any emails), that address gets "Too many failed sign-ins" for 15 minutes. The C++ client refuses those attempts itself, without contacting the server; the table it uses (`loginGuard`) is on the Data Structures page. A correct sign-in resets the count for that email. Restarting the `client` container clears all locks: `docker compose restart client`.
- **Fault injection** (Administration → System) makes the server fail on purpose to show the retry queue. Only the admin can use it; set it back to 0% ("Fault injection off") after the demo.
- **Containers run as unprivileged users**, not root.
- **Backups are your job.** The database is one file on a volume; copy it out regularly (section 5) if the data matters.

---

## 8. Optional: Sign in with Google

A **Continue with Google** button appears on the sign-in page once you give HackTrack a Google *client ID*. Without one, the button is hidden and nothing else changes.

### How it works

```
browser ──(1) Google popup──► Google        user picks their account
browser ◄─(2) ID token──────── Google        a JWT signed by Google: email, name, "for app X"
browser ──(3) POST /api/auth/google ──► C++ client ──► Node server
                                        checks the     checks Google's signature with Google's
                                        token's shape  public keys, the app ID, expiry, verified
                                                       email; signs in or creates a participant
browser ◄─(4) HackTrack session token ── C++ client caches it in its hash table, like any login
```

- The website still talks only to the C++ client. Google is only the identity check.
- A Google email that matches an existing account signs in to **that** account. A new email becomes a **participant**. Admins can change roles under Administration as usual.
- Accounts created with Google have no password. Their owners always use the Google button.
- There is no client *secret*. The client ID is public; it appears in the page source, which is normal.

### B-G1. Create the client ID (once, about 10 minutes)

1. Open <https://console.cloud.google.com/> and sign in with your Google account.
2. Create a project: project picker (top bar) → **New project** → name it `HackTrack` → **Create**, then select it.
3. Go to **APIs & Services → OAuth consent screen**. Newer consoles call it **Google Auth Platform**; click **Get started**.
   - App name `HackTrack`, user support email: yours.
   - Audience: **External**.
   - Contact email: yours. Accept the policy, then **Create**.
4. **Audience → Test users → Add users**: add the Gmail addresses that should be able to sign in while the app is in *Testing* mode (you, your teammates, your guide). To let anyone sign in, click **Publish app**. HackTrack asks only for name and email, which does not need Google's review.
5. **Clients** (or *Credentials → Create credentials → OAuth client ID*):
   - Application type: **Web application**, name `HackTrack web`.
   - **Authorized JavaScript origins**: add every address the site is opened from, exactly as in the browser bar, with no trailing slash:
     - `http://localhost` (Docker on your PC)
     - `http://localhost:3000` (`npm run start:all`)
     - your public address, for example `https://203-0-113-7.sslip.io` or `https://hacktrack.yourdomain.com`
   - Authorized redirect URIs: leave empty. HackTrack uses Google's popup, not a redirect.
   - **Create**, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

> Google accepts `localhost` over plain HTTP, but a public site must be **HTTPS with a name**, not a bare IP address. Do B7 (HTTPS) first. If Google rejects the `sslip.io` name, use a real domain.

### B-G2. Switch it on

**With Docker** (your PC or the server): add the ID to `.env` and rebuild. The website build bakes the ID into the page, so a restart alone is not enough.

```ini
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

```bash
docker compose up -d --build
docker compose logs server | grep "Google sign-in"    # should say: Google sign-in on
```

**Without Docker** (`npm run start:all`): create `.env.local` in the project folder (never committed):

```ini
NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

`start-all` passes the same ID to the server. Restart it.

### If it does not work

| Symptom | Cause |
|---|---|
| No Google button | The ID was not present when the website was built: rebuild (Docker) or restart `start-all` |
| Google popup says **"origin is not allowed"** or `invalid_client` | The exact address in the browser bar is missing from *Authorized JavaScript origins* (check `http` vs `https`, the port, `www`). Changes can take a few minutes to apply |
| Google says **"access blocked … app has not completed verification"** or the account cannot continue | The app is in Testing mode and that Gmail address is not a test user (B-G1 step 4) |
| HackTrack says "Google sign-in is not set up on this server" | The server did not get `GOOGLE_CLIENT_ID`: check `.env`, then `docker compose up -d` |
| HackTrack says "could not be verified (Token is for a different app)" | The website and the server have different client IDs |
| HackTrack says "could not be verified (Token expired)" | The server's clock is wrong: `timedatectl` on the server should show `System clock synchronized: yes` |

---

### How this setup is checked

Every push to GitHub runs [the CI workflow](.github/workflows/ci.yml): it builds the C++ client on Linux and runs the server tests, the C++ unit tests and the end-to-end tests (report Table 3). It then builds all four Docker images, starts them with `docker compose up`, and runs `scripts/smoke-test.sh` against them. Results are under the repository's **Actions** tab.
