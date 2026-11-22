# Note to SHARKX product owner (draft)

**To:** [SHARKX product owner] · **From:** Conalytic · **Re:** SHARKX Agency CRM: technical approach and what we need in week 1

Hello [name],

We are starting the build. Please reply to sections 1 and 2 within 3 working days.

## 1. Technical approach: please confirm in writing
The first six change SOW §5 only: nothing changes in what your team sees, and they cut cost and moving parts. The last one changes SOW §4 scope.
- Live updates by short polling (about every 5 seconds) instead of WebSocket. Leads still appear "within seconds".
- A PostgreSQL job queue instead of Redis/BullMQ: one less service to run and pay for, same retries and reminders.
- No Cloudflare R2 at launch: CSV files are processed in memory, so there are no files to store.
- Error and uptime alerts by email to your alert address, plus a health page, instead of Sentry.
- Two-factor sign-in by a 6-digit code emailed at login. An authenticator app can follow as an extra.
- **Hosting region:** Railway has no UAE region. We launch in Railway Europe West (Amsterdam), the lowest-latency option for the UAE and Morocco. The SOW says the database "can move to a UAE region if required". Tell us if UAE residency is required at launch.
- **Client login instead of the secure link:** each client signs in to its own dashboard (analytics, leads with MQL/SQL/Not qualified marking, WhatsApp chats read-only, connectors) instead of opening a no-login link. SOW §4 lists the lead link and lists client logins as out of scope, so please confirm this in writing as a change order.

## 2. What we need from SHARKX (project day)
- **Day 1:**
  - Start Meta business verification and send the business documents: legal name, registered address, trade licence, phone, website, and a domain verified by DNS. It blocks WhatsApp and Meta leads and can take days.
  - Name the product owner and one review contact.
  - Railway Pro account with us invited as admin.
  - Won status (Client Requirements #14): we treat it as an optional extra unless you say otherwise.
- **Day 3:**
  - Domain and DNS access, and the address for the app.
  - Brand assets (logo, colours, fonts).
  - A Resend account in SHARKX's name, plus the DNS records for the sending domain.
  - The address that receives system alerts.
  - Privacy policy and terms-of-service URLs on SHARKX's domain, plus data-deletion instructions. The Meta, Google, LinkedIn, TikTok and Snapchat reviews all ask for them.
- **Day 5:**
  - For the pilot client: admin access to the Facebook Page and Meta ad account (including the dataset/Pixel used for conversions), and to Google Ads (including YouTube lead forms) with access suitable for sending conversions back. Clients connect their own accounts later from their dashboard.
  - **TikTok, LinkedIn and Snapchat ad-account admin access** for the pilot client. It is not on the Client Requirements list but milestone M3 needs it.
  - For LinkedIn: business email, legal name, registered address, website and a verified company Page. LinkedIn commits to no response time.
- **Day 7:**
  - A pilot client: WhatsApp Business app number (app version 2.24.17+, in active use for at least 7 days) and the owner with the phone to scan the QR code and approve the 6-month history.
  - A live lead form or test campaign on each platform.
- **By day 14:** book SHARKX reviewers and one pilot client for testing on days 22–28.
- **Day 18:** a native Arabic and a native French reviewer for the interface during testing.

## 3. Timeline and acceptance
- **Day 21:** release candidate on staging for your review. **Days 22–28:** testing with live accounts, fixes, production go-live.
- Each milestone is reviewed within 3 working days (SOW T&C 2).
- Milestones that need live platform access are accepted when verified on live accounts. If an approval or access arrives late, the timeline moves by the same period (T&C 4). We will keep a dated log of every request and delivery and share it weekly.
- Handover and the 30-day warranty start at production go-live.
- WhatsApp notes: history imports once at connection (within 24 hours), groups are not synced, and the Business app must be opened about every two weeks or the link drops.

Thank you,
[name], Conalytic
