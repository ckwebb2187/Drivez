# Kaido Maps roadmap (automated)

One ticket per run, top to bottom. Marks: `[ ]` to do · `[x]` done · `[!]` failed (see LOG) · `[?]` needs owner answer.
Size: S = small, M = medium. Anything bigger is split into parts.
Source notes: Obsidian vault (Google Drive), "Kaido Maps - Development Updates" and
"Kaido Maps - Driving Precision & Multiplayer Features" (Oct 25, 2026), plus the older roadmap note.

## Phase 0: Speed first
- [x] T01 · S · Take the charts library off startup. `charts-*.js` (~88 KB gz) loads at startup.
  Find what statically imports recharts in the startup path (start at `src/components/StatsDashboard.jsx`,
  `src/pages/Profile.jsx`) and load it with `React.lazy`/`import()`. Done when `charts` is not in startup files in perf-check.
- [x] T02 · S · Check the startup path for other heavy imports (three.js, qrcode, leaflet) that could load later.
  Lazy-load any that aren't needed for the first screen. Done when startup KB drops or the ticket logs "nothing to cut".

## Phase 1: Navigation basics
- [?] T03 · S · Avoid Tolls / Avoid Ferries switches in route settings. Saved across sessions (localStorage like other settings).
  Router is OSRM (`src/lib/nav.js` ~line 156): add `&exclude=toll,ferry` as chosen. If OSRM rejects it, hide the switch and mark `[?]`.
  Owner: the free OSRM server rejects every `exclude` (toll, ferry, motorway). Switching to the free Valhalla router (FOSSGIS) would allow it. OK to switch routers?
  Changing a switch re-plans the current route.
- [x] T04 · S · Raise stop limit to 15: `MAX_STOPS` in `src/lib/nav.js`. Check the OSRM trip/optimize call still works with 16 points.
- [x] T05 · M · Drag-to-reorder stops in `src/components/TripPlanner.jsx` (touch-friendly, no new library if possible), plus route preview after reorder.
- [x] T06 · M · Elevation chart for a planned route. Free source: Open-Meteo elevation API (sample ~50 points). Lazy-load the chart.
- [x] T07 · S · Home & Work map markers: soft pulsing beacon / light pillar at saved Home and Work. Respect battery saver (no animation).
- [x] T08 · M · Arrival animation: neon ring grows at the destination; camera eases from the low chase view up to a bird's-eye view as you stop.
- [x] T09 · M · Auto End Drive: when `nav.arrived` (`src/lib/useNavigation.js`) and speed ~0 for a few seconds inside the destination area,
  end the drive automatically, fade out the drive HUD, and show the summary card (distance, Flow Score, smoothness, acceleration times).

## Phase 2: Map life
- [x] T10 · M · Area pings: radar-style pulses on scenic lookouts, Toge sections, meets and specialty stops already in app data. Battery saver = static dots.
- [x] T11 · M · Passing pings: small game-style tag when you pass a friend or convoy member (friends' live positions already exist). Not tappable while moving.
- [x] T12 · S · Convoy radar blips: add convoy members to the existing `MeetRadar` component as minimal dots.
- [x] T13 · S · HUD style: animated black wireframe look for the route header and Groups tab; make the Groups button smaller.

## Phase 3: Driving skill
- [x] T14 · S · Acceleration times: add 60–100 mph and 30 mph roll times next to the existing 0-60 (drive stats code). Show on trip detail and profile showcase.
- [x] T15 · M · Toge sections, part 1: data model (records entity `sector`) and a way to save a stretch of road from a past drive as a section.
- [x] T16 · M · Toge sections, part 2: score each pass: cornering smoothness, steady side g-force, clean entry/exit. No speed-based points.
- [ ] T17 · M · Ghost runs, part 1: on a saved section, show your personal best as a ghost marker during the drive.
- [ ] T18 · S · Ghost runs, part 2: compare against the convoy leader's run on the same section.

## Phase 4: Group drives & voice
- [ ] T19 · M · Discord voice: one-tap join from the drive screen (deep link to the group's Discord channel) and a mute/unmute button on the HUD.
- [x] T20 · S · Convoy alerts, spoken hands-free: "<friend> just left", "is halfway", "just arrived". Opt-in per trip.
- [x] T21 · M · Spotted mode, part 1: opt-in setting, delayed location, home zone where you're never shown.
- [x] T22 · M · Spotted mode, part 2: spotted feed and "crossed paths" cards after a drive.

## Phase 5: Offline
- [ ] T23 · M · Offline route, part 1: when a route is planned, cache its map tiles along the corridor in the service worker (size cap, clear old).
- [ ] T24 · M · Offline route, part 2: cache turn steps, elevation and hazard alerts for the route so turn-by-turn works with no signal.

## Backlog
- [ ] T25 · S · Car builder: LED grille and front splitter options (`src/lib/car3d.js`, `src/components/CarBuilder.jsx`).
- [ ] T26 · M · Meet photographers: photo drops onto a meet's page for attendees.
- [ ] T27 · M · Road scores: rate roads (twistiness, surface) from drives and reports.
- [ ] T28 · M · Local legends map (Louisiana): curated famous roads and spots layer.
- [ ] T29 · M · Feature requests board with upvotes.
- [ ] T30 · S · Report-a-problem form (goes to a records entity the owner can read).
- [ ] T31 · S · Splash animation on app open (light-trail K logo). Must not slow startup: CSS only, under 2 KB.

## Done before automation
- [x] Family & parental controls (shared location, places, check-in, SOS, teen alerts, parent controls) (done before automation)

## Needs a decision (automation skips these)
- [?] Crash detection: check patents first.
- [?] Gas prices: no free data source.
- [?] EV chargers: needs a free Open Charge Map API key added by the owner.
- [?] OBD-II gauges: needs a Bluetooth OBD adapter plan for the Android app.
- [?] Featured landmarks / sponsored pins / premium: replace the non-commercial 3D WRX model before charging money.
- [?] Push-to-talk inside the app (vs. using Discord voice from T19).
