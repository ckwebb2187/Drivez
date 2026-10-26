# Update log

One line per run: date · ticket · result · startup KB · note.

2026-10-25 · setup · plan + speed checks added · live startup 631.5 KB gz (before T01) · baseline set on first build
2026-10-26 · setup · baseline set · startup 647.3 KB gz · build ok; no roadmap tickets matched earlier commits, Family moved to done
2026-10-26 · T01 · done · startup 559.4 KB gz (-87.9) · clsx was dragging charts into startup; moved to shared chunk · NOT deployed (wrangler login missing)
2026-10-26 · T01 · deployed · startup 559.4 KB gz (was 647.3) · live check ok, load 169 ms; deploy rule fixed
2026-10-26 · T02 · done · startup 559.4 KB gz (no change) · nothing to cut: three/qrcode/leaflet already lazy; maplibre (278 KB) is the home drive map, needed at first screen · no deploy
2026-10-26 · T20-T22 · done in an owner session (push-to-talk, convoy progress alerts, spotted mode, crossed paths) · deployed with T01/T02 merged
2026-10-26 · T03 · needs decision · - · free OSRM rejects exclude=toll/ferry; asked owner about Valhalla
2026-10-26 · T04 · done · startup 563 KB gz · 15 stops; OSRM trip+route ok with 17 points
2026-10-26 · T05 · done · startup 563 KB gz (+3.6 incl. T04) · drag grip on each stop, re-plans route on drop
2026-10-26 · owner · Settings button on drive screen (moving = tap twice, for passengers) + new KM bronze app icon (web/PWA; Android needs a new APK)
2026-10-26 · T06 · done · startup 563.6 KB gz (+0.6) · elevation strip under a planned route, Open-Meteo 50 samples, plain SVG, lazy-loaded
2026-10-26 · T04-T06 · deployed · live check ok (slow PC network, ipv4first) · -
2026-10-26 · T07 · done · startup 564.1 KB gz (+0.5) · Home/Work beacon + light pillar, still dot in battery saver
2026-10-26 · T08 · done · startup 564.6 KB gz · neon rings at destination, camera eases to bird's-eye on arrival
2026-10-26 · T09 · done · startup 564.6 KB gz · arrived + stopped 8 s ends the drive; summary card (distance, time, flow, 0-60, max g)
2026-10-26 · T07-T09 · deployed · live check ok 258 ms · -
2026-10-26 · T10 · done · startup 565 KB gz · radar ping on map pins (meets now; sections later), none in battery saver
2026-10-26 · T11 · done · startup 565 KB gz · FRIEND/GROUP tag when someone goes from 400 m+ to 150 m, not tappable
2026-10-26 · T12 · already done · - · convoy members were already 'group' blips in MeetRadar (convoyDrivers in mapFriends)
2026-10-26 · T13 · done · startup 565.4 KB gz (+0.8) · black animated wireframe turn card (themed looks) + smaller Groups button
2026-10-26 · T10-T13 · deployed · live check ok 258 ms · -
2026-10-26 · T14 · done · startup +0.2 KB · 30 roll (30-70) and 60-100 timed from GPS; on trip detail + profile Best times
2026-10-26 · T15 · done · startup +0 KB · Sector records entity (owner-only); Save a Tōge section on trip detail with start/end sliders, orange preview
2026-10-26 · T16 · done · startup +0.3 KB · passes found after each drive, scored on smoothness/steady side g/clean entry-exit (no speed); SectorRun records with a light trace; lazy-loaded
2026-10-26 · T17 · done · startup +0.5 KB · entering a saved section shows your best run as a see-through ghost car (trace replayed by time)
2026-10-26 · T18 · done · startup +0.2 KB · /convoys/:code/leader-run (members only) returns leader's best run on a section starting nearby; shown as 'Leader' ghost
2026-10-26 · T14-T18 · deployed · live check ok 215 ms (first try 404 while Cloudflare updated) · -
2026-10-26 · T19 · done · startup +0.3 KB · group drive HUD: one-tap Discord (group's link) + mute/unmute group audio (voice clips + spoken updates; app can't mute Discord itself)
2026-10-26 · T23 · done · startup +0.4 KB · SW keeps loaded map tiles/style/fonts (2500 cap) for offline; planned route's corridor z10-15 pre-cached (600 cap, last route only)
2026-10-26 · T24 · done · startup +0.2 KB · steps already kept (dz-live-nav); road reports + route weather alerts saved to phone (12 h); SW keeps Open-Meteo elevation; reroute offline keeps old route
2026-10-26 · T25 · done · startup +0.1 KB · LED grille bar (headlight color) and carbon front splitter in the builder; details buttons now a 3-col grid
2026-10-26 · T26 · done · startup +0 KB · meet_photos table (IF NOT EXISTS); RSVP'd people add photos, host/owner can delete; Photos strip on meet cards
2026-10-26 · T26 · deployed · live check ok 144 ms · meet-photo route live
2026-10-26 · T27 · part 1 done · startup +0 KB · road_ratings table; Rate this road (surface/fun) on trip detail; /roads/score endpoint; split T27b for showing on routes
2026-10-26 · T27b · done · startup +0.3 KB · 'Road: fun/surface stars · rough spots · twisty' line on planned routes
2026-10-26 · T28 · done · startup +1 KB · 7 curated Louisiana legends (src/lib/legends.js, approx. pins) with radar pings, info sheet + Drive there; Map look toggle (on by default)
