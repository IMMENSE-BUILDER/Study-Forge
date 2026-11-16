/* ============================================================
   Study Forged — IPU Pack (Satyam · ADGIPS · B.Tech IT · Sem 1)
   Profile, Semester-1 syllabus (GGSIPU 2025-26 scheme + Sec E
   timetable, AY 2026-27) and seed/migration helpers.
   Loaded BEFORE script.js. All consumers guard with typeof.
   ============================================================ */

const SF_STATE_VERSION = 6;
const SF_APP_VERSION = "v0.6.65";

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
  "PPS": { code: "ICT-101", name: "Programming for Problem Solving", faculty: "Ms. Alka" },
  "BEE": { code: "ICT-103T/ICT-106T", name: "Basics of Electrical Engineering", faculty: "Ms. Pooja" },
  "SMT": { code: "ICT-107", name: "System Modeling Techniques - I", faculty: "Dr. Suryya Farhat" },
  "PHL": { code: "ICT-111 T", name: "Engineering Physics–I", faculty: "Dr. Mamta Gupta" },
  "CSL": { code: "ICT-113", name: "Communication Skill", faculty: "Dr. Samikshya" },
  "EVSL": { code: "ICT-117T", name: "Environmental Studies", faculty: "Dr. Kavita Gupta" },
  "EM": { code: "ICT-119", name: "Engineering Mechanics", faculty: "Mr. Naman Bajpai" },
  "EGL": { code: "—", name: "Engineering Graphics + Lab", faculty: "Mr. Naman Bajpai" },
  "PD": { code: "—", name: "Personality Development", faculty: "Dr. Samikshya" },
  "PPS LAB": { code: "ICT-151 / 101P", name: "PPS Lab", faculty: "Mr. Ankit Jain" },
  "PHP": { code: "ICT-111 P", name: "Engineering Physics Lab–1", faculty: "Dr. Mamta Gupta" },
  "EVSP": { code: "ICT-117P", name: "Environment Studies Lab", faculty: "Dr. Kavita Gupta" },
  "BEE LAB": { code: "ICT-103P/ICT-106P", name: "Basics of Electrical Engineering Lab", faculty: "Ms. Pooja" },
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

/* Authoritative Affiliated B.Tech (AY 2026-27) Syllabus & Scheme
   Theory: 40 Continuous Evaluation + 60 Term-End Exam (Q1 compulsory 12 marks full-syllabus;
   4 units × 12 marks, attempt 1 of 2 per unit = 60 total). Aliases = ADGIPS timetable. */
const SF_SEM1_SUBJECTS = [
  {
    alias: "PPS", code: "ICT-101", name: "Programming for Problem Solving",
    group: "ES", credits: 3, marking: "40 internal + 60 external (Q1 compulsory 12m + 4 units × 12m)", lab: "ICT-151 / 101P PPS Lab",
    book: "B.W. Kernighan & D.M. Ritchie — The C Programming Language / Jens Gustedt — Modern C (2025)",
    units: [
      "U1: C program structure, basic types (fixed-width ints, bool), operators & expressions, type conversions, printf/scanf, compound blocks, if-else, switch, loops, break/continue/goto, flowcharts, dry runs, C89/C99/C11/C23 standards",
      "U2: Functions, recursion, inline/macros, storage classes (auto/static/extern/register/thread_local), scope & lifetime, 1D/2D arrays, bubble/selection/insertion sort, linear/binary search, string I/O & manipulation, command-line arguments, floating point root finding",
      "U3: Structures, nested structs, unions, enums, bit-fields, pointers & arithmetic, dynamic memory (malloc/calloc/realloc/free, leak prevention), compound literals, polynomial arithmetic, matrices, File I/O (text/binary), errno handling",
      "U4: ADTs (singly/doubly linked lists, stack infix-postfix & parenthesis balancing, linear/circular/priority queues, binary tree traversals), function pointers, _Generic macros, _Static_assert, safer macros, header hygiene",
    ],
  },
  {
    alias: "SMT", code: "ICT-107", name: "System Modeling Techniques–I",
    group: "ES", credits: 3, marking: "40 internal + 60 external (Q1 compulsory 12m + 4 units × 12m)", lab: null,
    book: "Erwin Kreyszig — Advanced Engineering Mathematics (10th Ed., Wiley, 2011)",
    units: [
      "U1: Functions of several variables, partial derivatives, chain rule, implicit differentiation, exact differentials, Jacobians, Taylor/Maclaurin series, maxima/minima, Lagrange multipliers, Leibniz rule (differentiation under integral sign); 1st-order ODEs: direction fields, Euler's method, separable, exact, integrating factors, Bernoulli, orthogonal trajectories",
      "U2: Higher-order linear ODEs with constant coeffs, differential operator method, Euler-Cauchy equations, Wronskian, variation of parameters, free oscillations of mass-spring systems; Power series solutions: Bessel equation & functions, Legendre polynomials, recurrence relations, Gamma & Beta functions",
      "U3: Matrices & determinants, Gauss & Gauss-Jordan elimination, rank, vector spaces, linear independence, Cramer's rule, eigenvalues/eigenvectors, symmetric/orthogonal matrices, eigenbases, diagonalization, quadratic forms, Gram-Schmidt orthogonalization, Cayley-Hamilton, LU & Cholesky decomposition",
      "U4: Vector & scalar point functions, space curves, arc length, curvature, gradient, directional derivative, divergence, curl, line integrals, path independence, double & triple integrals, surface integrals, Green's theorem, Gauss divergence theorem, Stokes' theorem",
    ],
  },
  {
    alias: "EM", code: "ICT-119", name: "Engineering Mechanics",
    group: "ES", credits: 3, marking: "40 internal + 60 external (Q1 compulsory 12m + 4 units × 12m)", lab: null,
    book: "A.K. Tayal — Engineering Mechanics (Umesh Publications); Timoshenko, Young & Rao (McGraw Hill)",
    units: [
      "U1: Force System: introduction, transmissibility, resultant, resolution, moment of force about a line, Varignon's theorem, couples & properties; Equilibrium: free body diagrams, equilibrium equations, equilibrium of two-force and three-force members",
      "U2: Structures: plane trusses (perfect/imperfect, assumptions, method of joints, method of sections, graphical method); Friction: static/kinetic, dry friction laws, coefficient, angle of repose, cone of friction, frictional lock, flat pivot & collar bearing, flat belts",
      "U3: Kinematics of Particles: rectilinear & plane curvilinear motion, rectangular/normal-tangential coords; Kinetics of Particles: equations of motion, work-energy, impulse-momentum, impact of bodies, coefficient of restitution, loss of energy during impact",
      "U4: Kinematics of Rigid Bodies: rigid body types of motion, absolute motion, relative velocity & acceleration (Corioli's excluded), instantaneous center of zero velocity; Kinetics of Rigid Bodies: equations of motion, translation & fixed-axis rotation, work-energy & conservation",
    ],
  },
  {
    alias: "BEE", code: "ICT-103T / ICT-106T", name: "Basics of Electrical Engineering",
    group: "ES", credits: 3, marking: "40 internal + 60 external (Q1 compulsory 12m + 4 units × 12m)", lab: "ICT-103P / ICT-106P BEE Lab",
    book: "Charles K. Alexander & Matthew N.O. Sadiku — Fundamentals of Electric Circuits (7th Ed., 2022); D.P. Kothari & I.J. Nagrath",
    units: [
      "U1: Electric charge, current, voltage, energy, power, independent & dependent sources, Ohm's law, series/parallel, voltage/current division, source transformations, KCL, KVL, basic circuit modeling, practical resistor behavior, power calculations",
      "U2: Nodal & mesh analysis, linearity & superposition theorem, Thevenin's, Norton's, maximum power transfer theorem, circuit simplification, controlled sources, transient analysis of first-order circuits, natural & step response of RL and RC circuits",
      "U3: Sinusoidal signals & phasors, impedance & admittance in frequency domain, node & mesh analysis in phasor domain, AC power (average, reactive, complex, power factor correction), resonance in series & parallel RLC, balanced 3-phase circuits, phase sequence, 3-phase loads",
      "U4: Magnetic circuits, Faraday's & Lenz's laws, inductance & mutual inductance, ideal & real transformers, DC machines operating principles, DC motors & generators types/characteristics, 3-phase induction motors (torque-slip), circuit protection & grounding, digital infrastructure power systems, energy auditing",
    ],
  },
  {
    alias: "PHL", code: "ICT-111 T", name: "Engineering Physics–I",
    group: "ES", credits: 3, marking: "40 internal + 60 external", lab: "ICT-111 P Semi Lab (PHP)",
    book: "Donald Neamen — Semiconductor Physics and Devices",
    units: [
      "U1: Crystal lattices, Miller indices, energy bands, intrinsic/extrinsic semiconductors, drift/diffusion",
      "U2: PN junction, depletion, I-V, Zener/avalanche breakdown, Schottky & tunnel diodes",
      "U3: BJT, JFET/MOSFET, LEDs, photodiodes, solar cells, laser diodes",
      "U4: IC fabrication (oxidation, lithography, etching), cleanroom, TCAD intro",
    ],
  },
  {
    alias: "CSL", code: "ICT-113", name: "Communication Skills",
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
    alias: "EVSL", code: "ICT-117T", name: "Environmental Studies",
    group: "VAC", credits: 2, marking: "100 Teachers Continuous Evaluation (NUES qualifying, non-credit)", lab: "ICT-117P EVSP practical",
    book: "Erach Bharucha — Environmental Studies (3rd Ed., Orient Blackswan, 2020); Daniel B. Botkin — Environmental Science",
    units: [
      "U1: Scope & importance of environmental studies, historical perspectives, ecological principles, levels of organization, ecosystem components (biotic/abiotic), energy flow, biogeochemical cycles, biodiversity conservation, threats & ecosystem services value",
      "U2: Renewable & non-renewable resources, sustainable use principles, water resources & management, global distribution, challenges & water pollution, land degradation & soil types, mining environmental consequences, energy resources, deforestation & wildlife conservation",
      "U3: Air, water, soil, noise, marine, thermal pollution, hazardous waste management (sources, effects, mitigation), Electronic Waste (E-Waste) Management, environmental toxicology, public health, climate change, ozone depletion, acid rain, smog, environmental disasters",
      "U4: Environmental legislation & policies, government agencies role, Environmental Impact Assessment (EIA) concept & purpose, sustainable development, environmental ethics (anthropocentrism, biocentrism, ecocentrism, deep ecology), population & urbanization, NGOs & public participation, case studies",
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
    ["SMT", "SMT · System Modeling Techniques–I (ICT-107)", "Sem 1 · ES · 3 cr"],
    ["EM", "EM · Engineering Mechanics (ICT-119)", "Sem 1 · ES · 3 cr"],
    ["BEE", "BEE · Basics of Electrical Engineering (ICT-103T/ICT-106T)", "Sem 1 · ES · 3 cr"],
    ["PHL", "PHL · Engineering Physics–I (ICT-111T)", "Sem 1 · ES · 3 cr"],
    ["CSL", "CSL · Communication Skills (ICT-113)", "Sem 1 · AEC · 3 cr"],
    ["EVSL", "EVSL · Environmental Studies (ICT-117T)", "Sem 1 · NUES qualifying"],
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
