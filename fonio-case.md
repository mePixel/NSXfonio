**START HACK VIENNA '26  ·  CASE**

**fonio.ai**

*Empty slots, filled before they go cold.*

Build the voice agent that turns every cancellation into a booking — detecting the freed slot, picking the right person off the waitlist and closing it on a call, all in under a minute.

| Track partner | fonio.ai |
| :---- | :---- |
| **Team size** | 2–4 people |
| **Prize** | €2,000 cash \+ 12 months fonio access |
| **Code freeze** | Sunday, June 7, 14:00 sharp |

# **About fonio.ai**

fonio.ai builds AI phone assistants that pick up the phone for businesses. Instead of missed calls, hold queues, and overloaded teams, fonio's AI agents handle inbound and outbound calls — sounding natural, understanding intent, booking appointments, taking orders, and answering customer questions around the clock. It started in the DACH market with native European telephony and GDPR-compliant, best-in-class German-language conversation, and now serves customers across the UK, Italy, France, Poland, and Brazil, with more markets (including the US) on the way.

Founded in Vienna in 2024 by Daniel Keinrath and Matthias Gruber, fonio is one of the fastest-growing SaaS companies in Europe. It serves over 8,000 customers and has been profitable since day one. In March alone it added over €1M in new ARR — more than 20x the year before, on the back of one of Europe's largest angel rounds (€3M from 13 angels, closed in 11 days) — and is targeting €30M ARR by the end of the year.

# **The Problem**

When somebody cancels an appointment, the slot is empty. Refilling it today means someone at the practice picks up a paper list or a spreadsheet and starts dialing through it. Most calls hit voicemail. After fifteen minutes the slot is often still empty, so it stays empty.

This happens every day at clinics, salons, legal practices, repair shops, hotels — anywhere that runs on appointments. The empty slot is lost income, repeated dozens of times a week. No voice AI platform handles this automatically today, even though both halves of the loop already happen on the phone: the cancellation comes in, the recovery call goes out. The work is sitting there.

# **The Challenge**

Build something inside fonio that closes the loop. A cancellation comes in, the system picks the right person from a waiting list, calls them, offers the slot, and books it on yes — all within about a minute. The waiting list can live in fonio or in the customer's existing system. Consent for the outbound call has to be handled properly.

# **What You're Building**

A working version closes the loop end-to-end without anyone at the practice touching a phone. A cancellation comes in, and your system:

* Picks the right person from the waitlist — not just the first

* Calls them. The call sounds personal, not like a robocall

* Handles yes, no, callback, voicemail

* Books the slot and updates everything downstream

* On no or no-answer: continues with the next candidate

* On edge cases: degrades cleanly and surfaces what needs a human

Throughout, a dashboard shows the receptionist what's happening live, and the practice owner can pull up weekly numbers — refill rate, revenue recovered, attempts per slot, and outcomes by reason.

# **Data & Resources**

* **A pre-provisioned fonio account per hacker** — one account for every participant on this track (30 in total). Credentials are shared via Discord / email. API docs and configuration live inside your account. Need more accounts during the build? Ask the fonio team on Discord.

What you won't get (design it yourself):

* Waitlists, customers, slots — design your own data model

* Workflow skeletons and UI starters

* A specific medical context — dental, GP, dermatology, gynaecology, whatever fits your story. Pick one and own it.

# **Demo & Pitch Expectations**

What we want to see:

* A live outbound call to a real phone, triggered by a cancellation event

* The end-to-end loop closing: cancellation in, candidate picked, call placed, outcome captured, slot resolved

* At least one edge case handled visibly — you'll find them as you build

*Don't build the generic chatbot. That's easy. Build the version the receptionist would miss if it disappeared on Sunday. Surprise us.*

# **What Great Looks Like**

Three example directions — not the only valid ones:

**The Intelligent Dispatcher.** Optimize hard on candidate selection. Build a scoring model that weighs urgency, time preference, treatment match, consent, contact history, and fairness. The call itself is solid but not the hero — the win is that the right person gets called every time, and you can explain exactly why.

**The Conversational Closer.** Make the call itself the magic. Deep work on dialog: a context-rich opening, natural handling of hesitation and questions, smooth booking confirmation. The selection logic is decent but not flashy — the win is that patients actually engage and say yes more often than a human would get.

**The Operator's Cockpit.** Build for the receptionist and owner first. A dashboard so good it changes how the practice runs: live call status, override controls, refill metrics, revenue recovered. The phone work is solid, but the differentiator is that you'd want to use this on Monday morning.

Any combination of the above works. So does a fourth angle nobody has thought of yet.

## **Out of Scope**

* Production deployment — sandbox \+ mocks are fine. Show it works, don't run it 24/7

* Multi-tenant or multi-practice — one practice is enough

* Mobile apps — a web dashboard or CLI is enough

* Native integrations with real EHR / calendar / CRM systems — mock cleanly, label clearly

* Regulatory paperwork (DPA templates, audit certifications) — show you've thought about it, don't draft it

* Polished marketing site or pitch-deck design — we're judging the build, not the visuals around it

* Multiple languages — German or English. Pick one, do it well

# **Judging Criteria**

Your track is judged on these five criteria (totalling 100%):

| Criterion | Weight | What it means |
| :---- | :---- | :---- |
| Functional MVP / Does It Actually Work | 30% | Does the demo run end-to-end with a real outbound call, or does it fall back to slides? |
| Technical Execution | 25% | Solid engineering choices that would survive production: persistence, error handling, idempotency, sane architecture. |
| Problem Fit & Relevance | 20% | Did the team understand the actual problem (the receptionist's day, the personalization issue) or solve an adjacent, easier one? |
| User Experience & Design | 15% | Can the receptionist actually use the dashboard? Can the owner read the numbers? |
| Pitch & Storytelling | 10% | Four minutes, clear and honest. Show the build, not the slideware. |

# **Mentors & Jury**

Reach the fonio team on Discord throughout the build for help with the platform, scoping, and unblocking.

| Role | Who | Notes |
| :---- | :---- | :---- |
| Mentor (on site) | Nicolas Hosp | HR, fonio — with a direct line to the engineering team for technical questions |
| Mentor (on site) | Marco Caputo | GTM Lead Italy, fonio |
| Tech mentor (Discord) | Kim | Forward Deployment Engineer, fonio |
| Jury | Nicolas Hosp | Selects the fonio Track Winner |

## **Mentor availability**

* Saturday: 13:00–14:00 and 17:00–18:00

* Sunday: 10:00–11:00

Outside these windows the team is reachable on Discord — drop your question in the fonio track channel.

# **Submission**

One submission per team via the START Hack submission form (Tally), by the code freeze on Sunday, June 7 at 14:00. Late submissions are not accepted. The form link is shared on Discord.

What you submit:

* **Public GitHub repository** (MIT license) in the START Hack Vienna '26 GitHub organization, in the fonio folder, in your team's folder.

* **3-minute demo video** showing the full loop end to end: cancellation in → slot detected → candidate picked → outbound call → slot booked.

* **Written submission** on the Tally form: project title, one-line pitch, team & members, problem, solution overview, tech stack, and links.

* **Optional:** a live demo link, a pitch deck (PDF), and a recommended REPORT.md in your repo for the technical write-up.

## **Repository requirements**

* Public at submission time, with an MIT LICENSE file at the root

* A README with setup and run instructions; be honest about what's working vs. mocked

* No secrets in the repo (API keys, tokens, credentials)

# **The Fine Print**

## **Intellectual property**

All code is committed to the START Hack Vienna '26 public GitHub organization under the MIT license. Hackers retain copyright of their work. By participating, hackers grant the case partner of their assigned track a perpetual, worldwide, royalty-free, non-exclusive license to use, modify, distribute, and commercialize their work product. Hackers keep the right to use, develop further, and commercialize their own work in parallel.

## **Judging flow**

The fonio jury reviews all track submissions on Sunday from 14:00–16:00 and selects the Track Winner plus second and third place. The Track Winner then pitches live to an external jury from 16:00–17:00 for the overall award.