// Riftbrawl proposal deck in the Turn'em Sideways house style (matches TES_Deck_Refresh_07-2026-v2).
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const ASSETS = path.join(__dirname, "assets");
const b64 = (f) => "image/png;base64," + fs.readFileSync(path.join(ASSETS, f)).toString("base64");
const BG = b64("bg.png"), BG_CLOSE = b64("bg_closing.png"), BORDER = b64("border_left.png"), LOGO = b64("logo.png");

// ---- TES palette ----
const YEL = "F2F047", LIME = "B3FF40", BLUE = "71A5FC", CYAN = "11B6FB", TEAL = "00C3D0";
const INK = "212121", CARD = "2B2B2B", CARD2 = "3A3A3A", WHITE = "FFFFFF", G1 = "C9C9C9", G2 = "9C9C9C";
const F = "Montserrat";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625
pres.author = "Turn'em Sideways";
pres.title = "Riftbrawl Proposal";

const L = 1.08, R = 9.62, W = R - L; // content column

function base(s, title, sub) {
  s.addImage({ data: BG, x: 0, y: 0, w: 10, h: 5.625 });
  s.addImage({ data: BORDER, x: 0, y: 0, w: 0.896, h: 5.625 });
  s.addText(title, { x: L, y: 0.22, w: W, h: 0.55, fontFace: F, fontSize: 26, bold: true, color: YEL, isTextBox: true, margin: 0, valign: "middle" });
  if (sub) s.addText(sub, { x: L, y: 0.72, w: W, h: 0.3, fontFace: F, fontSize: 10.5, italic: true, color: G1, isTextBox: true, margin: 0 });
}
function foot(s, text) {
  s.addText(text, { x: L, y: 5.18, w: W, h: 0.36, fontFace: F, fontSize: 7.5, italic: true, color: G2, isTextBox: true, margin: 0, valign: "top" });
}
function tag(s, text, x, y, fill = YEL) {
  const w = Math.min(W, text.length * 0.082 + 0.22);
  s.addShape(pres.ShapeType.rect, { x, y, w, h: 0.23, fill: { color: fill }, line: { color: fill, width: 0 } });
  s.addText(text.toUpperCase(), { x, y, w, h: 0.23, fontFace: F, fontSize: 8.5, bold: true, italic: true, color: INK, isTextBox: true, margin: [0, 0.06, 0, 0.06], valign: "middle" });
  return w;
}
function card(s, x, y, w, h, fill = CARD) {
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 } });
}
function stat(s, x, y, w, big, label, color = LIME, size = 22) {
  s.addText(big, { x, y, w, h: 0.45, fontFace: F, fontSize: size, bold: true, color, isTextBox: true, margin: 0, valign: "bottom" });
  s.addText(label, { x, y: y + 0.47, w, h: 0.4, fontFace: F, fontSize: 8.5, bold: true, color: G1, isTextBox: true, margin: 0, valign: "top" });
}
function body(s, text, x, y, w, h, size = 10, color = G1, extra = {}) {
  s.addText(text, { x, y, w, h, fontFace: F, fontSize: size, color, isTextBox: true, margin: 0, valign: "top", ...extra });
}
function bullets(s, items, x, y, w, h, size = 10) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { code: "25AA", indent: 12 }, breakLine: i < items.length - 1, paraSpaceAfter: 4 } })),
    { x, y, w, h, fontFace: F, fontSize: size, color: WHITE, isTextBox: true, margin: 0, valign: "top" });
}
function numSquare(s, n, x, y, fill) {
  s.addShape(pres.ShapeType.rect, { x, y, w: 0.42, h: 0.42, fill: { color: fill }, line: { color: fill, width: 0 } });
  s.addText(n, { x, y, w: 0.42, h: 0.42, fontFace: F, fontSize: 12, bold: true, color: INK, align: "center", valign: "middle", isTextBox: true, margin: 0 });
}
const TEAMS = [["DSG", "Disguised"], ["TSS", "The Secret Sauce"], ["ASC", "Ascension"], ["CTCG", "Challenger TCG"]];
const TEAM_COLORS = [YEL, LIME, BLUE, CYAN];

// ============ 1. TITLE ============
{
  const s = pres.addSlide();
  s.addImage({ data: BG_CLOSE, x: 0, y: 0, w: 10, h: 5.625 });
  s.addImage({ data: LOGO, x: 3.9, y: 0.45, w: 2.2, h: 2.2 * 433 / 1000 });
  s.addText("RIFTBRAWL", { x: 1, y: 1.65, w: 8, h: 0.95, fontFace: F, fontSize: 54, bold: true, color: YEL, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  s.addText("3V3V3V3 TEAM BRAWL SHOWCASE FOR RIFTBOUND", { x: 1, y: 2.6, w: 8, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: WHITE, align: "center", isTextBox: true, margin: 0 });
  s.addText("Disguised · The Secret Sauce · Ascension · Challenger TCG · live with commentary",
    { x: 2, y: 3.02, w: 6, h: 0.35, fontFace: F, fontSize: 10.5, italic: true, color: G1, align: "center", isTextBox: true, margin: 0 });
  s.addText("EVENT & PRIZE-SUPPORT PROPOSAL", { x: 1, y: 3.95, w: 8, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: LIME, align: "center", isTextBox: true, margin: 0 });
  s.addText("TURN'EM SIDEWAYS  ×  ANZIDMTG   ·   SEPTEMBER 2026", { x: 1, y: 4.27, w: 8, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: G1, align: "center", isTextBox: true, margin: 0 });
  s.addNotes("Riftbrawl is a produced, team-based Riftbound showcase. We ran the first one in Singapore alongside the Regional Qualifier and want to make it a recurring stop-by-stop event with Riot/UVS or LGS prize support.");
}

// ============ 2. WHAT IS RIFTBRAWL ============
{
  const s = pres.addSlide();
  base(s, "WHAT IS RIFTBRAWL?", "A team-format invitational built for broadcast, not a Swiss grind.");
  const rows = [
    ["FOUR TEAMS OF THREE", YEL, "Disguised, The Secret Sauce, Ascension and Challenger TCG in a 3v3v3v3 team brawl. Flexes to 16 with an alternate per team."],
    ["ROUND ROBIN", LIME, "Every team plays every team. Short, high-stakes rounds keep the desk busy and the bracket easy to follow on stream."],
    ["PRODUCED SHOWCASE", BLUE, "Camera-ready feature table, a two-person commentary desk, overlays and player intros. Built to be watched."],
    ["TWO CHANNELS, ONE BROADCAST", CYAN, "Live on twitch.tv/turnemsideways and twitch.tv/anzidmtg, with match VODs and highlights on YouTube."],
  ];
  let y = 1.2;
  rows.forEach(([t, c, b]) => {
    tag(s, t, L, y, c);
    body(s, b, L, y + 0.3, 4.6, 0.6, 9.5);
    y += 0.98;
  });
  // right card
  card(s, 6.0, 1.2, 3.62, 3.82);
  s.addText("FORMAT AT A GLANCE", { x: 6.2, y: 1.35, w: 3.2, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: YEL, isTextBox: true, margin: 0 });
  const spec = [["PLAYERS", "12–16 (4 teams × 3, plus alternates)"], ["STRUCTURE", "3v3v3v3 team brawl, round robin"], ["RUN TIME", "One evening block (Friday)"], ["TABLE NEED", "One feature table + staging"], ["PRIZING", "Prize Wall tickets to the winning team"]];
  let sy = 1.75;
  spec.forEach(([k, v]) => {
    s.addText(k, { x: 6.2, y: sy, w: 1.1, h: 0.45, fontFace: F, fontSize: 8.5, bold: true, color: LIME, isTextBox: true, margin: 0, valign: "top" });
    s.addText(v, { x: 7.35, y: sy, w: 2.1, h: 0.45, fontFace: F, fontSize: 9, color: WHITE, isTextBox: true, margin: 0, valign: "top" });
    sy += 0.5;
  });
  s.addText("THE TEAMS", { x: 6.2, y: 4.22, w: 3.2, h: 0.25, fontFace: F, fontSize: 9, bold: true, color: YEL, isTextBox: true, margin: 0 });
  TEAMS.forEach(([ab], i) => {
    const x = 6.2 + i * 0.83;
    s.addShape(pres.ShapeType.rect, { x, y: 4.5, w: 0.75, h: 0.34, fill: { color: TEAM_COLORS[i] }, line: { color: TEAM_COLORS[i], width: 0 } });
    s.addText(ab, { x, y: 4.5, w: 0.75, h: 0.34, fontFace: F, fontSize: 10, bold: true, color: INK, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  });
  foot(s, "Format is deliberately compact: four teams, round robin, one evening. It fits a Friday slot before the main event without competing with the Regional Qualifier itself.");
}

// ============ 3. PROOF OF CONCEPT ============
{
  const s = pres.addSlide();
  base(s, "PROOF OF CONCEPT — SINGAPORE", "Pro-player invitational showdown, live from the RQ Singapore weekend — Sept 4–6, 2026.");
  tag(s, "THE SHOWCASE", L, 1.2, YEL);
  const cw = 2.1, ch = 1.05, gx = 0.15;
  const cards = [["4", "invited teams", LIME], ["12", "pro players on the feature table", LIME], ["3v3v3v3", "team brawl, round robin", BLUE], ["2", "streams: main broadcast + co-streams", BLUE]];
  cards.forEach(([b, l, c], i) => {
    const x = L + i * (cw + gx);
    card(s, x, 1.5, cw, ch);
    stat(s, x + 0.18, 1.58, cw - 0.3, b, l, c, 20);
  });
  tag(s, "THE TEAMS", L, 2.78, LIME);
  TEAMS.forEach(([ab, nm], i) => {
    const x = L + i * (cw + gx);
    card(s, x, 3.08, cw, 0.62, CARD2);
    s.addShape(pres.ShapeType.rect, { x: x + 0.12, y: 3.2, w: 0.62, h: 0.38, fill: { color: TEAM_COLORS[i] }, line: { color: TEAM_COLORS[i], width: 0 } });
    s.addText(ab, { x: x + 0.12, y: 3.2, w: 0.62, h: 0.38, fontFace: F, fontSize: 9.5, bold: true, color: INK, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    s.addText(nm, { x: x + 0.84, y: 3.2, w: cw - 0.95, h: 0.38, fontFace: F, fontSize: 9.5, bold: true, color: WHITE, valign: "middle", isTextBox: true, margin: 0 });
  });
  tag(s, "THE WEEKEND AROUND IT", L, 3.92, BLUE);
  const ctx = ["Riftbound Regional Qualifier: Singapore, Singapore EXPO — 2,055 players, $25,000 USD prize pool",
    "Official coverage on Riftbound's YouTube and Twitch; Toast, Sydeon, Yvonnie, Brodin and Frodan on the viewing stage",
    "Riftbrawl ran as the pre-RQ showcase; team-vs-team VODs are on YouTube now"];
  bullets(s, ctx, L, 4.2, W, 0.95, 9);
  foot(s, "Sources: YouTube “RIFTBRAWL: Singapore | A pro player invitational Showdown” and “RiftBrawl Singapore – DSG vs TSS vs ASC vs CTCG”; Liquipedia (RQ Singapore 2026); playriftbound.com “All Eyes on Singapore”. VOD view counts: add from YouTube Studio.");
  s.addNotes("Riftbrawl Singapore was a mini tournament for top teams attending RQ Singapore. VODs uploaded the week of Sept 3. Per-video view counts should be pulled from YouTube Studio before sending.");
}

// ============ 4. REACH ============
{
  const s = pres.addSlide();
  base(s, "WHERE IT STREAMS — REACH", "Both channels carry the show live. Turn'em Sideways YouTube adds the VOD and highlight audience.");
  const colW = 2.72, gap = 0.19;
  const cols = [
    ["TURN'EM SIDEWAYS · YOUTUBE", YEL, [["1,895,358", "lifetime views", LIME], ["425,739", "watch hours", LIME], ["38,000+", "avg. monthly unique viewers", BLUE], ["87%", "returning viewers", BLUE]], "Lifetime export through July 20, 2026"],
    ["TURN'EM SIDEWAYS · TWITCH", LIME, [["4,212", "hours watched, last 30 days", LIME], ["188", "peak concurrent viewers", LIME], ["66", "avg. viewers · 63 hrs live", BLUE], ["#8", "English Riftbound channel (#11 overall)", BLUE]], "TwitchMetrics, trailing 30 days"],
    ["ANZIDMTG · TWITCH", BLUE, [["7.9K", "followers · Twitch Partner", LIME], ["2,257", "peak concurrent viewers", LIME], ["4,535", "hours streamed all-time", BLUE], ["796", "active stream days", BLUE]], "TwitchTracker, all-time"],
  ];
  cols.forEach(([hd, c, stats, src], i) => {
    const x = L + i * (colW + gap);
    card(s, x, 1.2, colW, 3.75);
    tag(s, hd, x + 0.15, 1.35, c);
    stats.forEach(([b, l, sc], j) => {
      const sx = x + 0.15 + (j % 2) * 1.25, sy = 1.78 + Math.floor(j / 2) * 1.2;
      stat(s, sx, sy, 1.2, b, l, sc, 15);
    });
    s.addText(src, { x: x + 0.15, y: 4.5, w: colW - 0.3, h: 0.35, fontFace: F, fontSize: 7.5, italic: true, color: G2, isTextBox: true, margin: 0, valign: "top" });
  });
  foot(s, "YouTube figures: lifetime YouTube Analytics export (July 2026 deck). Twitch figures: public trackers as of early September 2026. anzidmtg also produced the Riftbound $10K at SCGCON Vegas.");
  s.addNotes("YouTube numbers are from the July 2026 TES deck refresh (lifetime export). Twitch numbers are from public trackers pulled the week of Sept 8, 2026.");
}

// ============ 5. TWO WAYS TO RUN IT ============
{
  const s = pres.addSlide();
  base(s, "TWO WAYS TO RUN IT — IDEALLY BOTH", "Pick the path that fits the venue. Either way we produce and stream it.");
  const colW = 4.17, gap = 0.2;
  const opts = [
    ["OPTION A — OFFICIAL FRIDAY SHOWCASE", YEL, "Inside the RQ venue, on the event schedule", ["Friday evening slot with a full commentary desk", "Feature table in the hall, produced like a top cut", "Prize Wall tickets funded by organized play", "Cross-promoted with the official broadcast and socials", "Sets up Saturday's co-stream audience"]],
    ["OPTION B — UNOFFICIAL AT THE LOCALS", LIME, "Partner game store near the venue", ["Runs Thursday or Friday night at a local game store", "Store provides prize support (packs, boxes, promos)", "We bring cameras, desk, overlays and the stream", "Drives foot traffic and signups to the store", "Zero schedule conflict with the main event"]],
  ];
  opts.forEach(([hd, c, sub, items], i) => {
    const x = L + i * (colW + gap);
    card(s, x, 1.2, colW, 2.6);
    tag(s, hd, x + 0.18, 1.35, c);
    body(s, sub, x + 0.18, 1.65, colW - 0.36, 0.3, 9, G2, { italic: true });
    bullets(s, items, x + 0.18, 2.0, colW - 0.36, 1.7, 9.5);
  });
  tag(s, "BOTH", L, 4.05, BLUE);
  body(s, "Hotel, flight voucher and meals for the production crew make either option viable at any stop on the calendar.", L + 0.75, 4.05, W - 0.75, 0.4, 9.5, WHITE, { bold: true });
  foot(s, "Option A is the preferred path. Option B is the fallback with a partner LGS. Best case is both: an official showcase plus a locals night.");
}

// ============ 6. THE ASK ============
{
  const s = pres.addSlide();
  base(s, "WHAT WE'RE ASKING FOR", "Small, specific, and mostly things the event already has on hand. Everything else, we bring.");
  const tiles = [
    ["40", "PRIZE WALL TICKETS", "Prizing for the winning team. Forty tickets is one Plated Legend at the wall, or split as packs across the podium.", LIME],
    ["THU", "TABLE SPACE IN THE HALL", "One feature table plus staging in the venue hall to set up, light and record. No stage, no AV from the venue.", YEL],
    ["FRI", "A SHOWCASE SLOT", "An evening window to run the round robin live with commentary.", BLUE],
    ["HOTEL", "ACCOMMODATIONS", "Rooms for the production crew across the event nights.", LIME],
    ["FLIGHT", "TRAVEL VOUCHER", "Travel to the host city for the crew, so each stop is a yes.", YEL],
    ["MEALS", "ON PRODUCTION DAYS", "Crew meals on Thursday and Friday.", BLUE],
  ];
  const w = 2.72, h = 1.72, gx = 0.19, gy = 0.18;
  tiles.forEach(([big, hd, bd, c], i) => {
    const x = L + (i % 3) * (w + gx), y = 1.2 + Math.floor(i / 3) * (h + gy);
    card(s, x, y, w, h);
    s.addText(big, { x: x + 0.18, y: y + 0.12, w: w - 0.36, h: 0.45, fontFace: F, fontSize: 22, bold: true, color: c, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(hd, { x: x + 0.18, y: y + 0.58, w: w - 0.36, h: 0.25, fontFace: F, fontSize: 9, bold: true, color: WHITE, isTextBox: true, margin: 0 });
    body(s, bd, x + 0.18, y + 0.86, w - 0.36, 0.8, 8.5, G1);
  });
  foot(s, "Prize Wall rate reference: 40 tickets = one Plated Legend (metal card); 1 ticket = one booster, per Riftbound Regional Qualifier prize-wall listings.");
}

// ============ 7. EVENT WEEKEND ============
{
  const s = pres.addSlide();
  base(s, "EVENT WEEKEND — HOW IT RUNS", "We only need table space Thursday and a Friday window. Nothing touches the main event days.");
  const steps = [
    ["THU", "LOAD-IN & RECORD", YEL, "Set the feature table in the hall, light it, record team intros and a format explainer. Badge-pickup day, so the hall is quiet."],
    ["FRI", "RIFTBRAWL LIVE", LIME, "Round robin showcase with a two-person desk. Simulcast on turnemsideways and anzidmtg. Winning team takes the Prize Wall tickets."],
    ["SAT", "CO-STREAM THE RQ", BLUE, "Both channels co-stream Day 1. Riftbrawl replays run during breaks and feed the audience into the main event."],
    ["SUN", "TOP CUT & VOD", CYAN, "Co-stream the Top 8. Riftbrawl match VODs and a highlight reel go up on YouTube the same week."],
  ];
  const w = 2.0, gap = 0.17;
  // timeline line
  s.addShape(pres.ShapeType.line, { x: L + 0.3, y: 1.62, w: W - 0.6, h: 0, line: { color: YEL, width: 1.5, endArrowType: "triangle" } });
  steps.forEach(([d, hd, c, bd], i) => {
    const x = L + i * (w + gap);
    s.addShape(pres.ShapeType.rect, { x: x, y: 1.45, w: 0.6, h: 0.34, fill: { color: c }, line: { color: c, width: 0 } });
    s.addText(d, { x, y: 1.45, w: 0.6, h: 0.34, fontFace: F, fontSize: 10, bold: true, color: INK, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    card(s, x, 2.0, w, 2.05);
    s.addText(hd, { x: x + 0.15, y: 2.12, w: w - 0.3, h: 0.3, fontFace: F, fontSize: 10.5, bold: true, color: c, isTextBox: true, margin: 0, valign: "top" });
    body(s, bd, x + 0.15, 2.5, w - 0.3, 1.5, 9, G1);
  });
  tag(s, "WE BRING", L, 4.3, YEL);
  body(s, "Cameras, switcher, overlays, commentary desk and talent, stream infrastructure, and the four invited teams.", L + 1.0, 4.3, W - 1.0, 0.4, 9.5, WHITE, { bold: true });
  foot(s, "Thursday is a quiet setup day. Friday is the showcase. Saturday and Sunday we co-stream the main event as usual, where Riftbrawl replays keep working for the organizer.");
}

// ============ 8. NEXT STOP ============
{
  const s = pres.addSlide();
  base(s, "NEXT STOP — AND WHAT HAPPENS NEXT", "Two windows on the calendar fit a Thursday setup and a Friday showcase.");
  const win = [
    ["RQ LOS ANGELES", YEL, "Sept 25–27, 2026 · Los Angeles Convention Center, West Hall A", "Thursday Sept 24 setup · Friday Sept 25 showcase"],
    ["NA REGIONAL CHAMPIONSHIP", LIME, "Dec 11–13, 2026 · Convergence Fest, Las Vegas", "Top 64 qualified players in the building · Thursday Dec 10 setup"],
  ];
  win.forEach(([hd, c, l1, l2], i) => {
    const y = 1.2 + i * 1.5;
    card(s, L, y, 4.6, 1.32);
    tag(s, hd, L + 0.18, y + 0.15, c);
    body(s, l1, L + 0.18, y + 0.5, 4.25, 0.35, 9, WHITE);
    body(s, l2, L + 0.18, y + 0.88, 4.25, 0.35, 9, c, { bold: true });
  });
  card(s, 5.95, 1.2, 3.67, 3.75);
  s.addText("TO LOCK IT IN", { x: 6.15, y: 1.35, w: 3.2, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: YEL, isTextBox: true, margin: 0 });
  const todo = ["Confirm the stop and the Friday window", "Approve 40 Prize Wall tickets (or LGS prize support)", "Confirm hotel, flight voucher and meals", "Assign Thursday table space in the hall", "Confirm the teams: Disguised, The Secret Sauce, Ascension, Challenger TCG"];
  const tc = [YEL, BLUE, LIME, CYAN, YEL];
  let y = 1.75;
  todo.forEach((t, i) => {
    numSquare(s, "0" + (i + 1), 6.15, y, tc[i]);
    body(s, t, 6.7, y + 0.02, 2.75, 0.55, 9, WHITE, { bold: true });
    y += 0.62;
  });
  foot(s, "Both windows are UVS/Riot organized-play weekends with a Friday start, which leaves Thursday for load-in and recording.");
}

// ============ 9. CLOSER ============
{
  const s = pres.addSlide();
  s.addImage({ data: BG_CLOSE, x: 0, y: 0, w: 10, h: 5.625 });
  s.addImage({ data: LOGO, x: 3.3, y: 0.75, w: 3.4, h: 3.4 * 433 / 1000 });
  s.addText("LET'S TURN'EM SIDEWAYS", { x: 1, y: 2.6, w: 8, h: 0.5, fontFace: F, fontSize: 26, bold: true, color: YEL, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  s.addText("Riftbrawl: four teams, one evening, two channels. Let's put it on the schedule.", { x: 1, y: 3.12, w: 8, h: 0.35, fontFace: F, fontSize: 11, italic: true, color: G1, align: "center", isTextBox: true, margin: 0 });
  s.addText("TURNEMSIDEWAYS.GG   ·   TWITCH.TV/TURNEMSIDEWAYS   ·   TWITCH.TV/ANZIDMTG", { x: 0.5, y: 3.85, w: 9, h: 0.35, fontFace: F, fontSize: 11, bold: true, color: LIME, align: "center", isTextBox: true, margin: 0 });
  s.addText("PARTNERSHIPS: [add contact email]", { x: 1, y: 4.3, w: 8, h: 0.3, fontFace: F, fontSize: 9.5, bold: true, color: WHITE, align: "center", isTextBox: true, margin: 0 });
  s.addNotes("Close with the two candidate windows and the five-item checklist. Replace the partnerships placeholder with the contact email before sending.");
}

pres.writeFile({ fileName: "Riftbrawl_Proposal.pptx" }).then(() => console.log("wrote Riftbrawl_Proposal.pptx"));
