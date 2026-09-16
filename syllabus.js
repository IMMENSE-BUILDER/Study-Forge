/* ============================================================
   Study Forge — IPU Pack (Satyam · ADGIPS · B.Tech IT · Sem 1)
   Profile, Semester-1 syllabus (GGSIPU 2025-26 scheme + Sec F
   timetable, AY 2026-27) and seed/migration helpers.
   Loaded BEFORE script.js. All consumers guard with typeof.
   ============================================================ */

const SF_STATE_VERSION = 5;
const SF_APP_VERSION = "v48";

function defaultProfile() {
  return {
    name: "Satyam Kumar",
    college: "ADGIPS",
    collegeFull: "Dr. Akhilesh Das Gupta Institute of Professional Studies, Shastri Park, Delhi",
    university: "GGSIPU",
    program: "B.Tech",
    branch: "Information Technology",
    year: 1,
    sem: 1,
    section: "E",
    room: "2310",
    ay: "2026–27",
  };
}

/* Faculty + timetable codes from the official Sec-E timetable (Room 2310).
   E1/E2 = lab batches (section splits in two for practicals). */
const SF_FACULTY = {
  "PPS": { code: "ICT-101 T", name: "Programming for Problem Solving", faculty: "Ms. Alka" },
  "BEE": { code: "ICT-103 T", name: "Basics of Electrical Engineering", faculty: "Ms. Pooja" },
  "SMT": { code: "ICT-107", name: "System Modeling Techniques", faculty: "Dr. Suryya Farhat" },
  "PHL": { code: "ICT-111 T", name: "Engineering Physics–I", faculty: "Dr. Mamta Gupta" },
  "CSL": { code: "ICT-113", name: "Communication Skill", faculty: "Dr. Samikshya" },
  "EVSL": { code: "—", name: "Environment Studies", faculty: "Dr. Kavita Gupta" },
  "EM": { code: "ICT-119", name: "Engineering Mechanics", faculty: "Mr. Naman Bajpai" },
  "EGL": { code: "—", name: "Engineering Graphics + Lab", faculty: "Mr. Naman Bajpai" },
  "PD": { code: "—", name: "Personality Development", faculty: "Dr. Samikshya" },
  "PPS LAB": { code: "ICT-123", name: "PPS Lab", faculty: "Mr. Ankit Jain" },
  "PHP": { code: "ICT-111 P", name: "Engineering Physics Lab–1", faculty: "Dr. Mamta Gupta" },
  "EVSP": { code: "ICT-121 P", name: "Environment Studies Lab", faculty: "Dr. Kavita Gupta" },
  "BEE LAB": { code: "ICT-103 P", name: "Basics of Electrical Engineering Lab", faculty: "Ms. Pooja" },
};

const SF_TT_SLOTS = ["8:15-9:10", "9:10-10:05", "10:05-11:00", "11:00-11:30",
  "11:30-12:25", "12:25-1:20", "1:20-2:15", "2:15-3:10"];

/* Authoritative Sec-E weekly grid (Room 2310, AY 2026–27). */
const SF_TIMETABLE = {
  Mon: ["EM", "SMT", "PHL", "LUNCH", "E2 (EVS) / E1 (PHP)", "E2 (EVS) / E1 (PHP)", "BEE", "FREE"],
  Tue: ["FREE", "CSL", "EM", "LUNCH", "PPS LAB", "PPS LAB", "SMT", "EVSL"],
  Wed: ["CSL", "E1(EVS Lab) / E2(BEE)", "E1(EVS Lab) / E2(BEE)", "LUNCH", "PHL", "PPS", "EVS(L/P)", "FREE"],
  Thu: ["PHL", "EVSL", "SMT", "LUNCH", "PPS", "CSL", "BEE", "EM"],
  Fri: ["PPS", "EGL", "EGL", "LUNCH", "E1 (BEE) / E2 (PHP)", "E1 (BEE) / E2 (PHP)", "BEE", "PD"],
};

/* Resolve a timetable cell to a known subject alias for faculty lookup. */
function ttResolve(cell) {
  if (!cell) return null;
  const c = String(cell).toUpperCase();
  if (c === "FREE" || c === "LUNCH") return c;
  const order = ["PPS LAB", "BEE LAB", "SMT", "EVSP", "EVS", "PPS", "BEE", "PHL", "PHP", "CSL", "EGL", "EM", "PD"];
  for (const alias of order) {
    if (c.includes(alias)) return alias === "PHP" ? "PHP" : alias === "EVS" ? "EVSL" : alias;
  }
  return null;
}

function ttInfo(cell) {
  const alias = ttResolve(cell);
  if (!alias || alias === "FREE" || alias === "LUNCH") return { alias, cell, meta: null };
  return { alias, cell, meta: SF_FACULTY[alias] || null };
}

/* Split-batch labs: E1 = first 30 students, E2 = students 31–60.
   Keyed by exact SF_TIMETABLE cell text; the batch split shows in the tap-toast. */
const SF_BATCH_LEGEND = "E1 = first 30 students · E2 = students 31–60";
const SF_LAB_INFO = {
  "E2 (EVS) / E1 (PHP)": { batches: "E1 (1–30): PHP lab · E2 (31–60): EVS lab" },
  "E1(EVS Lab) / E2(BEE)": { batches: "E1 (1–30): EVS lab · E2 (31–60): BEE lab" },
  "E1 (BEE) / E2 (PHP)": { batches: "E1 (1–30): BEE lab · E2 (31–60): PHP lab" },
};

/* Short box labels for the split-lab doubles (tap-toast keeps the full text). */
const SF_TT_SHORT = {
  "E2 (EVS) / E1 (PHP)": "E2·EVS / E1·PHP",
  "E1(EVS Lab) / E2(BEE)": "E1·EVS / E2·BEE",
  "E1 (BEE) / E2 (PHP)": "E1·BEE / E2·PHP",
};

function ttShort(cell) {
  if (typeof SF_TT_SHORT !== "undefined" && SF_TT_SHORT[cell]) return SF_TT_SHORT[cell];
  return cell;
}

/* Condensed from the official GGSIPU B.Tech 2025-26 scheme + Appendix A
   (40 internal + 60 external theory; Q1 compulsory 12 marks full-syllabus;
   4 units × 12 marks, attempt 1 of 2 per unit). Aliases = ADGIPS timetable. */
const SF_SEM1_SUBJECTS = [
  {
    alias: "PPS", code: "ICT-101", name: "Programming for Problem Solving",
    group: "ES", credits: 3, marking: "40 internal + 60 external", lab: "ICT-151 PPS Lab",
    book: "Kernighan & Ritchie — The C Programming Language",
    units: [
      "U1: C basics, datatypes, operators, printf/scanf, if-switch-loops, flowcharts, dry runs",
      "U2: Functions, recursion, storage classes, 1D/2D arrays, bubble/selection/insertion sort, linear/binary search, strings",
      "U3: Structures/unions/enums, pointers & arithmetic, malloc/calloc/free, matrices, file I/O",
      "U4: Linked lists, stacks & queues, infix→postfix, trees & traversals, function pointers",
    ],
  },
  {
    alias: "SMT", code: "ICT-105", name: "System Modeling Techniques–I",
    group: "ES", credits: 3, marking: "40 internal + 60 external", lab: null,
    book: "Engineering Mathematics reference (Kreyszig-style)",
    units: [
      "U1: Partial derivatives, maxima/minima, Lagrange multipliers, Jacobians, Taylor series, 1st-order ODEs",
      "U2: Power series, Bessel/Legendre/Hermite equations, Gamma & Beta functions",
      "U3: Matrices, rank, linear systems, eigenvalues/eigenvectors, diagonalization, SVD",
      "U4: Gradient/divergence/curl, line–surface–volume integrals, Green/Stokes/Gauss theorems",
    ],
  },
  {
    alias: "EM", code: "ICT-107/120", name: "Engineering Mechanics",
    group: "ES", credits: 3, marking: "40 internal + 60 external", lab: null,
    book: "A.K. Tayal — Engineering Mechanics",
    units: [
      "U1: Force systems, transmissibility, Varignon's theorem, FBD, equilibrium equations",
      "U2: Plane trusses (joints/sections), friction laws, angle of repose, belt friction",
      "U3: Particle kinematics (rectilinear/curvilinear); kinetics — work-energy, impulse-momentum, impact & restitution",
      "U4: Rigid-body kinematics (relative velocity/acceleration, instantaneous center); kinetics — translation, fixed-axis rotation, work-energy",
    ],
  },
  {
    alias: "BEE", code: "ICT-103/118", name: "Basics of Electrical Engineering",
    group: "ES", credits: 3, marking: "40 internal + 60 external", lab: "BEE Lab",
    book: "Alexander & Sadiku — Fundamentals of Electric Circuits",
    units: [
      "U1: Charge/current/voltage/power, Ohm's law, series–parallel, source transformation, KCL/KVL",
      "U2: Nodal/mesh analysis, superposition, Thevenin/Norton, max power transfer, RL/RC transients",
      "U3: Phasors, impedance, AC power & power factor, resonance, balanced 3-phase circuits",
      "U4: Magnetic circuits, transformers, DC machines, induction motors, safety & grounding",
    ],
  },
  {
    alias: "PHL", code: "ICT-110/117", name: "Semiconductor Engineering & Applications",
    group: "ES", credits: 3, marking: "40 internal + 60 external", lab: "ICT-157/160 Semi Lab (PHP)",
    book: "Donald Neamen — Semiconductor Physics and Devices",
    units: [
      "U1: Crystal lattices, Miller indices, energy bands, intrinsic/extrinsic semiconductors, drift/diffusion",
      "U2: PN junction, depletion, I-V, Zener/avalanche breakdown, Schottky & tunnel diodes",
      "U3: BJT, JFET/MOSFET, LEDs, photodiodes, solar cells, laser diodes",
      "U4: IC fabrication (oxidation, lithography, etching), cleanroom, TCAD intro",
    ],
  },
  {
    alias: "CSL", code: "ICT-109", name: "Communication Skills",
    group: "AEC", credits: 3, marking: "40 internal + 60 external", lab: null,
    book: "Wren & Martin — High School English Grammar",
    units: [
      "U1: Parts of speech, sentence structure, subject–verb agreement, vocabulary",
      "U2: Paragraph writing, paraphrasing, summarizing, précis writing",
      "U3: Agenda/minutes, letters, notices, memos, emails",
      "U4: Comprehension texts (Spielberg 2016 speech, Rockström TED talk)",
    ],
  },
  {
    alias: "EVSL", code: "ICT-112", name: "Environmental Studies",
    group: "VAC", credits: 2, marking: "100 internal, NUES qualifying (no end-sem)", lab: "EVSP practical",
    book: "Erach Bharucha — Environmental Studies",
    units: [
      "U1: Ecology, ecosystems, biodiversity & conservation",
      "U2: Natural resources — water, land, minerals, energy, forests",
      "U3: Pollution types, e-waste, climate change, disasters",
      "U4: Environmental laws, EIA, ethics, SDGs",
    ],
  },
  {
    alias: "PD", code: "College PD hour", name: "Personality Development",
    group: "VAC", credits: 2, marking: "As per college", lab: null,
    book: "Placement & soft-skills material (resume, GD, interviews)",
    units: [
      "U1: Self-awareness, SWOT, goal setting, time management",
      "U2: Spoken English, body language, presentation skills",
      "U3: Resume building, group discussions, interview skills",
      "U4: Teamwork, leadership, workplace ethics",
    ],
  },
  {
    alias: "EGL", code: "ETME-159 pattern", name: "Engineering Graphics + Lab",
    group: "Lab", credits: 1, marking: "40 internal + 60 external (lab)", lab: "EGL Lab",
    book: "N.D. Bhatt — Engineering Drawing",
    units: [
      "U1: Lettering, dimensioning, scales, BIS specs; points & lines projections (traces, true lengths, auxiliary planes)",
      "U2: Oblique/other planes; plane figures at angles; true shape by projection",
      "U3: Projection of solids in positions; axis/faces at angles; CADD intro",
      "U4: Isometric projection of surfaces & bodies; nomography basics",
    ],
  },
];

const SF_EXAM_INTEL = [
  "Theory papers: 40 internal (sessionals/assignments/attendance) + 60 end-sem.",
  "End-sem pattern: Q1 compulsory, 12 marks, full syllabus (short answers).",
  "Then 4 units × 12 marks — 2 questions per unit, attempt any 1.",
  "EVS (ICT-112) is 100% internal + qualifying — don't ignore it.",
  "Promotion needs ~50% of first-year credits — backlogs in Sem 1 follow you.",
];

const SF_TIMETABLE_NOTE = [
  "SEC E · IT-I · Room 2310 · 8:15 AM–3:10 PM · Lunch 11:00–11:30 · Sat off",
  "MON: EM, SMT, PHL | E2(EVS)/E1(PHP) double lab, BEE",
  "TUE: CSL, EM | PPS LAB double lab, SMT, EVSL",
  "WED: CSL, E1(EVS)/E2(BEE) double lab | PHL, PPS, EVS(L/P)",
  "THU: PHL, EVSL, SMT | PPS, CSL, BEE, EM",
  "FRI: PPS, EGL double | E1(BEE)/E2(PHP) double lab, BEE, PD",
  "E1/E2 = lab batches. Faculty: PPS Ms. Alka · BEE Ms. Pooja ·",
  "SMT Dr. Suryya Farhat · PHL Dr. Mamta Gupta · CSL Dr. Samikshya ·",
  "EVSL Dr. Kavita Gupta · EM+EGL Mr. Naman Bajpai · PPS Lab Mr. Ankit Jain.",
].join("\n");

/* Compact subject brief injected into the AI buddy's system prompt. */
function ipuBuddyBlock() {
  const lines = SF_SEM1_SUBJECTS.map(
    (s) => `- ${s.alias} (${s.code}): ${s.name}. ${s.units.join(" | ")}`
  );
  return [
    "--- YOUR STUDENT ---",
    "Name: Satyam Kumar — 1st-year B.Tech (IT), Sec E, Room 2310, ADGIPS Delhi (GGSIPU), Sem 1, AY 2026–27.",
    "His Sem-1 subjects (GGSIPU 2025-26 scheme):",
    ...lines,
    "IPU exam pattern: 40 internal + 60 external (EVS is 100 internal, qualifying).",
    "End-sem: Q1 compulsory 12 marks (whole syllabus) + 4 units × 12 marks (attempt 1 of 2 per unit).",
    "Tutor rules: stay exam-oriented (sessionals + end-sem), name the syllabus unit you are teaching from,",
    "quiz him on demand, use Hinglish examples only if he asks. Encouraging, brief, no filler.",
  ].join("\n");
}

/* Fresh-install seed: profile + sprint + subject goals + starter tasks + notes. */
function buildIPUSeed() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const iso = (d) => {
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  };

  const goalDefs = [
    ["PPS", "PPS · Programming for Problem Solving (ICT-101)", "Sem 1 · ES · 3 cr"],
    ["SMT", "SMT · System Modeling Techniques–I (ICT-105)", "Sem 1 · ES · 3 cr"],
    ["EM", "EM · Engineering Mechanics (ICT-107/120)", "Sem 1 · ES · 3 cr"],
    ["BEE", "BEE · Basics of Electrical Engineering (ICT-103/118)", "Sem 1 · ES · 3 cr"],
    ["PHL", "PHL · Semiconductor Engineering (ICT-110/117)", "Sem 1 · ES · 3 cr"],
    ["CSL", "CSL · Communication Skills (ICT-109)", "Sem 1 · AEC · 3 cr"],
    ["EVSL", "EVSL · Environmental Studies (ICT-112)", "Sem 1 · NUES qualifying"],
    ["EGL", "EGL · Engineering Graphics + Lab", "Sem 1 · Lab"],
    ["PD", "PD · Personality Development", "Sem 1 · PD hour"],
  ];
  const goals = goalDefs.map(([alias, title, tag]) => ({
    id: `ipu-goal-${alias.toLowerCase()}`,
    title,
    tag,
    progress: 0,
  }));
  const goalId = (alias) => `ipu-goal-${alias.toLowerCase()}`;

  const taskDefs = [
    ["PPS Unit I: write + dry-run 5 C basics programs", "60 mins", "PPS"],
    ["PPS Unit II: recursion + 2D array practice set", "90 mins", "PPS"],
    ["SMT Unit I: Lagrange multipliers — 8 problems", "60 mins", "SMT"],
    ["EM Unit I: FBD + equilibrium — 10 problems", "60 mins", "EM"],
    ["BEE Unit I: KCL/KVL worksheet", "45 mins", "BEE"],
    ["PHL Unit I: bands + drift/diffusion notes", "45 mins", "PHL"],
    ["CSL Unit II: précis writing ×2", "30 mins", "CSL"],
    ["EVSL Unit I: ecology + biodiversity notes", "30 mins", "EVSL"],
    ["EGL: sheet practice — orthographic projections", "45 mins", "EGL"],
    ["PD: self-SWOT + 1-min intro draft", "20 mins", "PD"],
  ];
  const tasks = taskDefs.map(([title, duration, alias], i) => ({
    id: `ipu-task-${i + 1}`,
    title,
    duration,
    status: "plan",
    goalId: goalId(alias),
  }));

  const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(now);
  const notes = [
    {
      id: "ipu-note-timetable",
      title: "🗓 My Timetable — Sec E · Room 2310",
      date: short,
      text: SF_TIMETABLE_NOTE,
      focus: 8,
      expanded: false,
    },
    {
      id: "ipu-note-exams",
      title: "📋 IPU Sem-1 Exam Intel",
      date: short,
      text: SF_EXAM_INTEL.join("\n"),
      focus: 9,
      expanded: false,
    },
  ];

  return {
    profile: defaultProfile(),
    sprint: { name: "Sem 1 · Sec E", start: iso(mon), end: iso(sun) },
    goals,
    tasks,
    notes,
    gauges: { consistency: 0, energy: 0, retention: 0 },
  };
}
