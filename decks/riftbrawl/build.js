const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

// ---------- palette (Riftbound / hextech) ----------
const NAVY = "0A1428";
const NAVY2 = "0F1D35";
const CARD = "16264A";
const CARD2 = "1B2E56";
const GOLD = "C8AA6E";
const GOLD2 = "F0C96A";
const TEAL = "0AC8B9";
const CREAM = "F0E6D2";
const MUTED = "9AA6BC";
const HEAD = "Cambria";
const BODY = "Calibri";

async function icon(Comp, color, px = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: px }));
  const buf = await sharp(Buffer.from(svg)).resize(px, px).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.author = "Turn'em Sideways";
  pres.title = "Riftbrawl Proposal";

  const I = {};
  const want = {
    users: fa.FaUsers, trophy: fa.FaTrophy, video: fa.FaVideo, plane: fa.FaPlane, hotel: fa.FaHotel,
    food: fa.FaUtensils, ticket: fa.FaTicketAlt, table: fa.FaChair, twitch: fa.FaTwitch, youtube: fa.FaYoutube,
    mic: fa.FaMicrophone, cal: fa.FaCalendarAlt, tower: fa.FaBroadcastTower, store: fa.FaStore,
    check: fa.FaCheckCircle, star: fa.FaStar, globe: fa.FaGlobeAsia, flag: fa.FaFlagCheckered,
    handshake: fa.FaHandshake, eye: fa.FaEye, clock: fa.FaClock, bolt: fa.FaBolt,
  };
  for (const [k, C] of Object.entries(want)) I[k] = await icon(C, NAVY);
  const Iteal = {};
  for (const [k, C] of Object.entries(want)) Iteal[k] = await icon(C, TEAL);

  // ---------- helpers ----------
  function bg(slide, color = NAVY) { slide.background = { color }; }
  function title(slide, text, opts = {}) {
    slide.addText(text, {
      x: 0.6, y: 0.45, w: 12.1, h: 0.9, fontFace: HEAD, fontSize: opts.size || 36, bold: true,
      color: opts.color || CREAM, isTextBox: true, margin: 0, valign: "middle",
    });
  }
  function kicker(slide, text, y = 1.3) {
    slide.addText(text, { x: 0.6, y, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 15, color: GOLD, isTextBox: true, margin: 0, italic: true });
  }
  function iconCircle(slide, key, x, y, d = 0.7, fill = GOLD) {
    slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
    const pad = d * 0.24;
    slide.addImage({ data: I[key], x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
  }
  function card(slide, x, y, w, h, fill = CARD) {
    slide.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.12,
      shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "000000", opacity: 0.35 },
    });
  }
  function footer(slide, text) {
    slide.addText(text, { x: 0.6, y: 6.95, w: 12.1, h: 0.35, fontFace: BODY, fontSize: 9.5, color: MUTED, isTextBox: true, margin: 0 });
  }
  function pageNo(slide, n) {
    slide.addText(String(n), { x: 12.3, y: 6.95, w: 0.4, h: 0.35, fontFace: BODY, fontSize: 9.5, color: MUTED, isTextBox: true, margin: 0, align: "right" });
  }
  function stat(slide, x, y, w, big, label, color = GOLD2) {
    slide.addText(big, { x, y, w, h: 0.85, fontFace: HEAD, fontSize: 40, bold: true, color, isTextBox: true, margin: 0, valign: "bottom" });
    slide.addText(label, { x, y: y + 0.9, w, h: 0.55, fontFace: BODY, fontSize: 12.5, color: CREAM, isTextBox: true, margin: 0, valign: "top" });
  }

  // =====================================================================
  // 1. TITLE
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    // subtle right-side glow blocks
    s.addShape(pres.ShapeType.ellipse, { x: 8.6, y: -1.2, w: 7, h: 7, fill: { color: CARD, transparency: 35 }, line: { color: CARD, width: 0 } });
    s.addShape(pres.ShapeType.ellipse, { x: 10.2, y: 3.6, w: 4.6, h: 4.6, fill: { color: CARD2, transparency: 45 }, line: { color: CARD2, width: 0 } });

    // 4-team ring diagram on the right
    const cx = 10.35, cy = 3.75, R = 1.55, d = 1.15;
    const teams = ["A", "B", "C", "D"];
    const pts = teams.map((_, i) => {
      const a = (-Math.PI / 2) + i * (Math.PI / 2);
      return { x: cx + R * Math.cos(a) - d / 2, y: cy + R * Math.sin(a) - d / 2 };
    });
    // connectors: four spokes from the center hub to each team
    s.addShape(pres.ShapeType.line, { x: cx, y: cy - R, w: 0, h: R * 2, line: { color: TEAL, width: 1.5 } });
    s.addShape(pres.ShapeType.line, { x: cx - R, y: cy, w: R * 2, h: 0, line: { color: TEAL, width: 1.5 } });
    // center
    s.addShape(pres.ShapeType.ellipse, { x: cx - 0.55, y: cy - 0.55, w: 1.1, h: 1.1, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    s.addImage({ data: I.trophy, x: cx - 0.3, y: cy - 0.3, w: 0.6, h: 0.6 });
    pts.forEach((p, i) => {
      s.addShape(pres.ShapeType.ellipse, { x: p.x, y: p.y, w: d, h: d, fill: { color: NAVY }, line: { color: GOLD, width: 2 } });
      s.addText([{ text: "TEAM " + teams[i], options: { breakLine: true, fontSize: 9, color: GOLD } }, { text: "3 players", options: { fontSize: 10.5, color: CREAM, bold: true } }],
        { x: p.x, y: p.y, w: d, h: d, fontFace: BODY, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    });

    s.addText("TURN'EM SIDEWAYS  ×  ANZIDMTG", { x: 0.7, y: 1.35, w: 7.5, h: 0.4, fontFace: BODY, fontSize: 14, color: GOLD, charSpacing: 4, isTextBox: true, margin: 0 });
    s.addText("RIFTBRAWL", { x: 0.7, y: 1.8, w: 8, h: 1.5, fontFace: HEAD, fontSize: 80, bold: true, color: CREAM, isTextBox: true, margin: 0, valign: "middle" });
    s.addText("A team brawl showcase for Riftbound", { x: 0.7, y: 3.3, w: 7.5, h: 0.6, fontFace: BODY, fontSize: 24, color: CREAM, isTextBox: true, margin: 0 });
    s.addText("3v3v3v3 round robin  ·  12–16 invited players  ·  live with commentary", { x: 0.7, y: 3.9, w: 7.5, h: 0.45, fontFace: BODY, fontSize: 15, color: TEAL, isTextBox: true, margin: 0 });
    s.addText("Event & prize-support proposal  ·  September 2026", { x: 0.7, y: 5.9, w: 7.5, h: 0.4, fontFace: BODY, fontSize: 13, color: MUTED, isTextBox: true, margin: 0 });
    s.addNotes("Opening: Riftbrawl is a produced, team-based Riftbound showcase. We ran the first one in Singapore alongside the Regional Qualifier and want to make it a recurring stop-by-stop event with Riot/UVS or LGS prize support.");
  }

  // =====================================================================
  // 2. WHAT IS RIFTBRAWL
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    title(s, "What is Riftbrawl?");
    kicker(s, "A team-format invitational built for broadcast, not a Swiss grind.");

    const rows = [
      ["users", "Four teams of three", "12 invited players in a 3v3v3v3 team brawl. Room to flex to 16 with an alternate per team."],
      ["flag", "Round robin, every team plays every team", "Short, high-stakes rounds keep the desk busy and the bracket easy to follow on stream."],
      ["mic", "Produced showcase with commentary", "Camera-ready table, a two-person desk, overlays and player intros. Built to be watched."],
      ["tower", "Streamed on two channels", "Live on twitch.tv/turnemsideways and twitch.tv/anzidmtg, with VOD and highlights on YouTube."],
    ];
    let y = 1.95;
    rows.forEach(([k, h, b]) => {
      iconCircle(s, k, 0.65, y + 0.05, 0.62);
      s.addText(h, { x: 1.5, y, w: 5.9, h: 0.38, fontFace: BODY, fontSize: 17, bold: true, color: CREAM, isTextBox: true, margin: 0 });
      s.addText(b, { x: 1.5, y: y + 0.38, w: 5.9, h: 0.62, fontFace: BODY, fontSize: 12.5, color: MUTED, isTextBox: true, margin: 0, valign: "top" });
      y += 1.15;
    });

    // right: format card
    card(s, 8.0, 1.95, 4.75, 4.55);
    s.addText("FORMAT AT A GLANCE", { x: 8.3, y: 2.15, w: 4.2, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: GOLD, charSpacing: 2, isTextBox: true, margin: 0 });
    const spec = [
      ["Players", "12–16 (4 teams × 3, + alternates)"],
      ["Structure", "3v3v3v3 team brawl, round robin"],
      ["Rounds", "Every team faces every team"],
      ["Run time", "One evening block (Friday)"],
      ["Table need", "One feature table + staging"],
      ["Prizing", "Prize Wall tickets to winning team"],
    ];
    let sy = 2.65;
    spec.forEach(([k, v]) => {
      s.addText(k, { x: 8.3, y: sy, w: 1.35, h: 0.5, fontFace: BODY, fontSize: 12, bold: true, color: TEAL, isTextBox: true, margin: 0, valign: "top" });
      s.addText(v, { x: 9.7, y: sy, w: 2.85, h: 0.5, fontFace: BODY, fontSize: 12, color: CREAM, isTextBox: true, margin: 0, valign: "top" });
      sy += 0.62;
    });
    pageNo(s, 2);
    s.addNotes("Format is deliberately compact: four teams, round robin, one evening. It fits into a Friday slot before the main event without competing with the RQ itself.");
  }

  // =====================================================================
  // 3. PROOF OF CONCEPT: SINGAPORE
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    title(s, "We already ran one: Riftbrawl Singapore");
    kicker(s, "Pro-player invitational showdown, live from RQ Singapore weekend (Sept 4–6, 2026).");

    // left stats
    stat(s, 0.65, 2.0, 2.6, "4", "teams: DSG · TSS · ASC · CTCG");
    stat(s, 3.45, 2.0, 2.6, "12", "pro players on the feature table");
    stat(s, 0.65, 3.85, 2.6, "3v3v3v3", "team brawl, round robin", TEAL);
    stat(s, 3.45, 3.85, 2.6, "2", "streams: main broadcast + co-streams", TEAL);

    // right context card
    card(s, 6.9, 1.95, 5.85, 4.55);
    s.addText("THE WEEKEND AROUND IT", { x: 7.2, y: 2.15, w: 5.3, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: GOLD, charSpacing: 2, isTextBox: true, margin: 0 });
    const ctx = [
      ["globe", "Riftbound Regional Qualifier: Singapore, Singapore EXPO"],
      ["users", "2,055 players in the main event, a $25,000 USD prize pool"],
      ["eye", "Official coverage on Riftbound's YouTube and Twitch from 10:00 SGT"],
      ["star", "Toast, Sydeon, Yvonnie, Brodin and Frodan featured on the viewing stage"],
      ["video", "Riftbrawl ran as the pre-RQ showcase, with team-vs-team VODs published on YouTube"],
    ];
    let cy = 2.65;
    ctx.forEach(([k, t]) => {
      s.addImage({ data: Iteal[k], x: 7.2, y: cy + 0.05, w: 0.32, h: 0.32 });
      s.addText(t, { x: 7.7, y: cy, w: 4.8, h: 0.62, fontFace: BODY, fontSize: 12.5, color: CREAM, isTextBox: true, margin: 0, valign: "top" });
      cy += 0.74;
    });

    s.addText("Takeaway: the format works on a live stage, the teams showed up, and the VODs are on YouTube now. Next: do it with proper prize support and a Friday slot.",
      { x: 0.65, y: 5.6, w: 5.8, h: 0.95, fontFace: BODY, fontSize: 13, italic: true, color: GOLD2, isTextBox: true, margin: 0, valign: "top" });
    footer(s, "Sources: YouTube “RIFTBRAWL: Singapore | A pro player invitational Showdown”, “RiftBrawl Singapore – DSG vs TSS vs ASC vs CTCG”; Liquipedia (RQ Singapore 2026); playriftbound.com “All Eyes on Singapore”.");
    pageNo(s, 3);
    s.addNotes("Riftbrawl Singapore was a mini tournament for top teams attending RQ Singapore. Four teams (DSG, TSS, ASC, CTCG), streamed with co-streams; VODs uploaded roughly five days ago. Per-video view counts should be pulled from YouTube Studio before sending.");
  }

  // =====================================================================
  // 4. REACH
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    title(s, "Two channels, one broadcast");
    kicker(s, "Both channels carry the show live. Numbers below are from public trackers as of early September 2026.");

    // Turn'em Sideways card
    card(s, 0.6, 1.95, 5.95, 4.6);
    iconCircle(s, "twitch", 0.9, 2.2, 0.6);
    s.addText("twitch.tv/turnemsideways", { x: 1.65, y: 2.2, w: 4.7, h: 0.32, fontFace: BODY, fontSize: 15, bold: true, color: CREAM, isTextBox: true, margin: 0 });
    s.addText("Riftbound coverage hub · co-streams every RQ", { x: 1.65, y: 2.52, w: 4.7, h: 0.3, fontFace: BODY, fontSize: 11, color: MUTED, isTextBox: true, margin: 0 });
    stat(s, 0.95, 3.0, 2.6, "4,212", "hours watched, last 30 days");
    stat(s, 3.7, 3.0, 2.6, "188", "peak concurrent viewers");
    stat(s, 0.95, 4.65, 2.6, "66", "average viewers · 63 hrs live", TEAL);
    stat(s, 3.7, 4.65, 2.6, "#8", "English Riftbound channel (#11 overall)", TEAL);

    // anzidmtg card
    card(s, 6.8, 1.95, 5.95, 4.6);
    iconCircle(s, "twitch", 7.1, 2.2, 0.6);
    s.addText("twitch.tv/anzidmtg", { x: 7.85, y: 2.2, w: 4.7, h: 0.32, fontFace: BODY, fontSize: 15, bold: true, color: CREAM, isTextBox: true, margin: 0 });
    s.addText("Twitch Partner · produced the Riftbound $10K at SCGCON Vegas", { x: 7.85, y: 2.52, w: 4.7, h: 0.3, fontFace: BODY, fontSize: 10, color: MUTED, isTextBox: true, margin: 0 });
    stat(s, 7.15, 3.0, 2.6, "7.9K", "Twitch followers");
    stat(s, 9.9, 3.0, 2.6, "2,257", "peak concurrent viewers");
    stat(s, 7.15, 4.65, 2.6, "4,535", "hours streamed all-time", TEAL);
    stat(s, 9.9, 4.65, 2.6, "796", "active stream days", TEAL);

    footer(s, "Sources: TwitchMetrics (turnemsideways, trailing 30 days); TwitchTracker (anzidmtg, all-time). YouTube VOD and co-stream views for Riftbrawl Singapore to be added from YouTube Studio.");
    pageNo(s, 4);
    s.addNotes("turnemsideways: 63 hours streamed, 4,212 hours watched, 66 average, 188 peak in the trailing 30 days; ranked #11 most-watched Riftbound channel and #8 English. anzidmtg: 7.9K followers, 65 average viewers, 2,257 peak, 4,535 hours across 796 active days; Twitch Partner who also produced the Riftbound $10K at SCGCON Vegas.");
  }

  // =====================================================================
  // 5. TWO WAYS TO RUN IT
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    title(s, "Two ways to run it. Ideally both.");
    kicker(s, "Pick the path that fits the venue. Either way we produce and stream it.");

    const col = (x, key, head, sub, items, accent) => {
      card(s, x, 1.95, 5.95, 4.35);
      iconCircle(s, key, x + 0.3, 2.2, 0.62, accent);
      s.addText(head, { x: x + 1.1, y: 2.2, w: 4.6, h: 0.35, fontFace: BODY, fontSize: 17, bold: true, color: CREAM, isTextBox: true, margin: 0 });
      s.addText(sub, { x: x + 1.1, y: 2.55, w: 4.6, h: 0.3, fontFace: BODY, fontSize: 11, color: MUTED, isTextBox: true, margin: 0 });
      let y = 3.1;
      items.forEach(t => {
        s.addImage({ data: Iteal.check, x: x + 0.35, y: y + 0.05, w: 0.26, h: 0.26 });
        s.addText(t, { x: x + 0.75, y, w: 4.9, h: 0.6, fontFace: BODY, fontSize: 12.5, color: CREAM, isTextBox: true, margin: 0, valign: "top" });
        y += 0.66;
      });
    };
    col(0.6, "trophy", "Option A · Official showcase", "Inside the RQ venue, on the event schedule",
      ["Friday evening slot with a full commentary desk", "Feature table in the hall, produced like a top-cut", "Prize Wall tickets funded by organized play", "Cross-promoted with the official broadcast and socials", "Sets up Saturday's co-stream audience"], GOLD);
    col(6.8, "store", "Option B · Unofficial at locals", "Partner game store near the venue",
      ["Runs Thursday or Friday night at a local game store", "Store provides prize support (packs, boxes, promos)", "We bring cameras, desk, overlays and the stream", "Drives foot traffic and signups to the store", "Zero schedule conflict with the main event"], TEAL);

    s.addText("Both: hotel, flight voucher and meals for the production crew make either option viable at any stop on the calendar.",
      { x: 0.6, y: 6.45, w: 12.1, h: 0.45, fontFace: BODY, fontSize: 13, italic: true, color: GOLD2, isTextBox: true, margin: 0 });
    pageNo(s, 5);
    s.addNotes("Option A is the preferred path: in-venue, on-schedule, with prize support from organized play. Option B is the fallback with a partner LGS. Best case is both: an official showcase plus a locals night.");
  }

  // =====================================================================
  // 6. THE ASK
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    title(s, "What we're asking for");
    kicker(s, "Small, specific, and mostly things the event already has on hand.");

    const tiles = [
      ["ticket", "40 Prize Wall tickets", "Prizing for the winning team. Forty tickets is one Plated Legend at the wall, or split as packs across the podium."],
      ["table", "Table space on Thursday", "One feature table plus staging in the venue hall to set up, light and record. No stage, no AV from the venue."],
      ["hotel", "Hotel accommodations", "Rooms for the production crew across the event nights."],
      ["plane", "Flight voucher", "Travel to the host city for the crew, so each stop is a yes."],
      ["food", "Meals", "Crew meals on production days."],
      ["cal", "A Friday slot", "An evening window to run the showcase with commentary."],
    ];
    const w = 3.85, h = 1.9, gx = 0.3, gy = 0.3, x0 = 0.6, y0 = 2.0;
    tiles.forEach(([k, hd, bd], i) => {
      const x = x0 + (i % 3) * (w + gx), y = y0 + Math.floor(i / 3) * (h + gy);
      card(s, x, y, w, h, i === 0 ? CARD2 : CARD);
      iconCircle(s, k, x + 0.25, y + 0.25, 0.58, i === 0 ? GOLD2 : GOLD);
      s.addText(hd, { x: x + 1.0, y: y + 0.28, w: w - 1.2, h: 0.52, fontFace: BODY, fontSize: 15, bold: true, color: CREAM, isTextBox: true, margin: 0, valign: "middle" });
      s.addText(bd, { x: x + 0.25, y: y + 0.98, w: w - 0.5, h: 0.95, fontFace: BODY, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, valign: "top" });
    });
    footer(s, "Prize Wall rate reference: 40 tickets = one Plated Legend (metal card); 1 ticket = one booster, per Riftbound Regional Qualifier prize-wall listings.");
    pageNo(s, 6);
    s.addNotes("The ask: 40 Prize Wall tickets, Thursday table space in the hall, hotel, flight voucher, meals, and a Friday showcase slot. Everything else, cameras, desk, overlays, talent, streaming, we bring.");
  }

  // =====================================================================
  // 7. PRODUCTION PLAN
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    title(s, "Event weekend: how it runs");
    kicker(s, "We only need table space Thursday and a Friday window. Nothing touches the main event days.");

    const steps = [
      ["THU", "Load-in & record", "Set the feature table in the hall, light it, record team intros and a format explainer. Badge pickup day, so the hall is quiet."],
      ["FRI", "Riftbrawl live", "Round robin showcase with a two-person desk. Simulcast on turnemsideways and anzidmtg. Winning team takes the Prize Wall tickets."],
      ["SAT", "Co-stream the RQ", "Both channels co-stream Day 1. Riftbrawl replays run during breaks and feed the audience into the main event."],
      ["SUN", "Top cut & VOD", "Co-stream Top 8. Riftbrawl match VODs and a highlight reel go up on YouTube the same week."],
    ];
    const w = 2.85, x0 = 0.6, y = 2.15, g = 0.25;
    steps.forEach(([d, hd, bd], i) => {
      const x = x0 + i * (w + g);
      s.addShape(pres.ShapeType.ellipse, { x: x, y, w: 0.9, h: 0.9, fill: { color: i === 1 ? GOLD2 : (i === 0 ? GOLD : CARD2) }, line: { color: i < 2 ? GOLD : TEAL, width: 1.5 } });
      s.addText(d, { x: x, y, w: 0.9, h: 0.9, fontFace: HEAD, fontSize: 15, bold: true, color: i < 2 ? NAVY : CREAM, align: "center", valign: "middle", isTextBox: true, margin: 0 });
      if (i < 3) s.addShape(pres.ShapeType.line, { x: x + 0.95, y: y + 0.45, w: w + g - 1.0, h: 0, line: { color: TEAL, width: 1.25, dashType: "dash" } });
      card(s, x, y + 1.2, w, 2.45);
      s.addText(hd, { x: x + 0.25, y: y + 1.4, w: w - 0.5, h: 0.4, fontFace: BODY, fontSize: 16, bold: true, color: i < 2 ? GOLD2 : TEAL, isTextBox: true, margin: 0 });
      s.addText(bd, { x: x + 0.25, y: y + 1.85, w: w - 0.5, h: 1.8, fontFace: BODY, fontSize: 12, color: CREAM, isTextBox: true, margin: 0, valign: "top" });
    });
    s.addText("We bring: cameras, switcher, overlays, commentary desk and talent, stream infrastructure, and the invited teams.",
      { x: 0.6, y: 6.15, w: 12.1, h: 0.45, fontFace: BODY, fontSize: 13, italic: true, color: GOLD2, isTextBox: true, margin: 0 });
    pageNo(s, 7);
    s.addNotes("Thursday is a quiet setup day (badge pickup). Friday is the showcase. Saturday and Sunday we co-stream the main event as usual, which is where Riftbrawl replays keep working for the organizer.");
  }

  // =====================================================================
  // 8. NEXT STEPS
  // =====================================================================
  {
    const s = pres.addSlide(); bg(s);
    s.addShape(pres.ShapeType.ellipse, { x: -2.5, y: 3.5, w: 7, h: 7, fill: { color: CARD, transparency: 40 }, line: { color: CARD, width: 0 } });
    title(s, "Next stop, and what happens next");
    kicker(s, "Two windows on the calendar fit a Thursday setup and a Friday showcase.");

    // candidate windows
    const win = [
      ["cal", "RQ Los Angeles", "Sept 25–27, 2026 · Los Angeles Convention Center, West Hall A", "Thursday Sept 24 setup · Friday Sept 25 showcase"],
      ["trophy", "NA Regional Championship", "Dec 11–13, 2026 · Convergence Fest, Las Vegas", "Top 64 qualified players in the building · Thursday Dec 10 setup"],
    ];
    win.forEach(([k, hd, l1, l2], i) => {
      const y = 2.0 + i * 1.55;
      card(s, 0.6, y, 6.6, 1.3);
      iconCircle(s, k, 0.85, y + 0.32, 0.62);
      s.addText(hd, { x: 1.7, y: y + 0.2, w: 5.3, h: 0.35, fontFace: BODY, fontSize: 16, bold: true, color: CREAM, isTextBox: true, margin: 0 });
      s.addText(l1, { x: 1.7, y: y + 0.55, w: 5.3, h: 0.3, fontFace: BODY, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0 });
      s.addText(l2, { x: 1.7, y: y + 0.85, w: 5.3, h: 0.3, fontFace: BODY, fontSize: 11.5, color: TEAL, isTextBox: true, margin: 0 });
    });

    // steps
    card(s, 7.6, 2.0, 5.15, 4.35);
    s.addText("TO LOCK IT IN", { x: 7.9, y: 2.2, w: 4.6, h: 0.35, fontFace: BODY, fontSize: 11, bold: true, color: GOLD, charSpacing: 2, isTextBox: true, margin: 0 });
    const todo = [
      "Confirm the stop and the Friday window",
      "Approve 40 Prize Wall tickets (or LGS prize support)",
      "Confirm hotel, flight voucher and meals",
      "Assign Thursday table space in the hall",
      "We invite the four teams and publish the schedule",
    ];
    let y = 2.7;
    todo.forEach((t, i) => {
      s.addShape(pres.ShapeType.ellipse, { x: 7.9, y: y + 0.02, w: 0.4, h: 0.4, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
      s.addText(String(i + 1), { x: 7.9, y: y + 0.02, w: 0.4, h: 0.4, fontFace: BODY, fontSize: 12, bold: true, color: NAVY, align: "center", valign: "middle", isTextBox: true, margin: 0 });
      s.addText(t, { x: 8.45, y, w: 4.1, h: 0.5, fontFace: BODY, fontSize: 12.5, color: CREAM, isTextBox: true, margin: 0, valign: "top" });
      y += 0.7;
    });

    s.addText("Turn'em Sideways  ·  turnemsideways.gg  ·  twitch.tv/turnemsideways  ·  twitch.tv/anzidmtg",
      { x: 0.6, y: 6.55, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 12, color: GOLD, isTextBox: true, margin: 0 });
    pageNo(s, 8);
    s.addNotes("Two realistic windows: RQ Los Angeles (Sept 25–27, LACC West Hall A) and the NA Regional Championship at Convergence Fest, Las Vegas (Dec 11–13). Close with the five-item checklist.");
  }

  await pres.writeFile({ fileName: "Riftbrawl_Proposal.pptx" });
  console.log("wrote Riftbrawl_Proposal.pptx");
})().catch(e => { console.error(e); process.exit(1); });
