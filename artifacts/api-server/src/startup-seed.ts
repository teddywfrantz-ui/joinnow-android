import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./lib/logger";

const log = (message: string) => logger.info(message);

function pick<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(d: number, h = 9) {
  const dt = new Date(Date.now() + d * 86400000);
  dt.setHours(h, 0, 0, 0);
  return dt;
}

const LAGUNA_USERNAMES = [
  'alex_laguna','sarah_beach','mike_tennis','priya_yoga','tom_hiker',
  'jen_art','carlos_golf','amy_runner','dan_photo','lisa_garden',
  'ryan_cycle','mia_surf','ethan_climb','olivia_book','noah_chess',
  'emma_cook','liam_board','ava_dance','james_swim','sophia_run'
];
const IRVINE_USERNAMES = [
  'kevin_uci','diana_irvine','marcus_tustin','preethi_oc','zach_great_pk',
  'lisa_irvine','ben_peters','rachel_oc_biz','chris_spectrum','heather_yoga',
  'dave_cyclist','nina_tustin','alex_mason_pk','jenny_coding','sam_bball',
  'mei_irvine','rob_oc_chef','ashley_improv','tom_oc_runs','grace_uci_bio'
];
const ALL_USERNAMES = [...LAGUNA_USERNAMES, ...IRVINE_USERNAMES];

async function seedMeetups() {
  const pw = await bcrypt.hash('password123', 10);

  // ── Laguna Niguel users ────────────────────────────────────────────────────
  const lagunaUserDefs = [
    { username:'alex_laguna',  displayName:'Alex Rivera',    gender:'male',   bio:'Love outdoor sports and beach life' },
    { username:'sarah_beach',  displayName:'Sarah Chen',     gender:'female', bio:'Yoga instructor and nature lover' },
    { username:'mike_tennis',  displayName:'Mike Johnson',   gender:'male',   bio:'Tennis player since age 8' },
    { username:'priya_yoga',   displayName:'Priya Patel',    gender:'female', bio:'Certified yoga teacher' },
    { username:'tom_hiker',    displayName:'Tom Williams',   gender:'male',   bio:'Weekend hiker and photographer' },
    { username:'jen_art',      displayName:'Jennifer Park',  gender:'female', bio:'Watercolor artist and coffee enthusiast' },
    { username:'carlos_golf',  displayName:'Carlos Martinez',gender:'male',   bio:'Golf addict, 12 handicap' },
    { username:'amy_runner',   displayName:'Amy Thompson',   gender:'female', bio:'Marathon runner and triathlete' },
    { username:'dan_photo',    displayName:'Dan Foster',     gender:'male',   bio:'Landscape and street photographer' },
    { username:'lisa_garden',  displayName:'Lisa Nguyen',    gender:'female', bio:'Master gardener and nature guide' },
    { username:'ryan_cycle',   displayName:'Ryan Davis',     gender:'male',   bio:'Road cyclist and coffee shop explorer' },
    { username:'mia_surf',     displayName:'Mia Santos',     gender:'female', bio:'Surf instructor at Dana Point' },
    { username:'ethan_climb',  displayName:'Ethan Brooks',   gender:'male',   bio:'Rock climbing and bouldering' },
    { username:'olivia_book',  displayName:'Olivia Turner',  gender:'female', bio:'Book club organizer and foodie' },
    { username:'noah_chess',   displayName:'Noah Wilson',    gender:'male',   bio:'Chess player and strategy games fan' },
    { username:'emma_cook',    displayName:'Emma Garcia',    gender:'female', bio:'Foodie and amateur chef' },
    { username:'liam_board',   displayName:'Liam Brown',     gender:'male',   bio:'Board games and trivia nights' },
    { username:'ava_dance',    displayName:'Ava Martinez',   gender:'female', bio:'Salsa dancer and Latin music lover' },
    { username:'james_swim',   displayName:'James Lee',      gender:'male',   bio:'Open water swimmer and ocean conservationist' },
    { username:'sophia_run',   displayName:'Sophia White',   gender:'female', bio:'5K and 10K trail runner' },
  ];

  const lagunaIds: number[] = [];
  for (const u of lagunaUserDefs) {
    const res = await db.execute(sql`
      INSERT INTO users (username, display_name, gender, bio, password, created_at)
      VALUES (${u.username}, ${u.displayName}, ${u.gender}, ${u.bio}, ${pw}, NOW())
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `);
    lagunaIds.push((res.rows[0] as any).id);
  }
  log(`[seed] Created/updated ${lagunaIds.length} Laguna users`);

  const L = lagunaIds;
  const lagunaEvents = [
    {
      title:'Tennis Clinic at Laguna Niguel Regional Park',
      description:'Intermediate-level tennis clinic with drills and match play. Bring racket and water.',
      theme:'Sports', lat:33.5234, lng:-117.7076,
      loc:'28241 La Paz Rd, Laguna Niguel, CA 92677',
      max:8, creator:L[2], expires:daysFromNow(4),
      others:[L[0],L[3],L[5],L[6],L[7],L[8],L[9]],
    },
    {
      title:'Golf Clinic at El Niguel Country Club',
      description:'Beginner-friendly golf clinic. Clubs provided. Learn swing fundamentals.',
      theme:'Sports', lat:33.5189, lng:-117.6978,
      loc:'23700 Clubhouse Dr, Laguna Niguel, CA 92677',
      max:10, creator:L[6], expires:daysFromNow(6),
      others:[L[0],L[1],L[2],L[3],L[4],L[5],L[7],L[8],L[9]],
    },
    {
      title:'Sunrise Photography Walk – Crown Valley Park',
      description:'Capture golden hour at Crown Valley Community Park. All skill levels welcome.',
      theme:'Arts', lat:33.5356, lng:-117.7012,
      loc:'29751 Crown Valley Pkwy, Laguna Niguel, CA 92677',
      max:12, creator:L[8], expires:daysFromNow(3),
      others:[L[0],L[1],L[2],L[3],L[4],L[5],L[6],L[7],L[9],L[10],L[11]],
    },
    {
      title:'Nature Walk & Bird Watching – Aliso Viejo Wilderness',
      description:'Guided nature walk identifying local birds and native plants. Easy trail, 2 miles.',
      theme:'Outdoors', lat:33.5412, lng:-117.7145,
      loc:'Aliso & Wood Canyons Wilderness Park, Laguna Niguel, CA',
      max:10, creator:L[9], expires:daysFromNow(5),
      others:[L[0],L[1],L[2],L[3],L[4],L[5],L[6],L[7],L[10]],
    },
    {
      title:'Outdoor Watercolor Art Session – Laguna Niguel Lake',
      description:'Paint the beautiful lake scenery. Supplies provided, just bring yourself!',
      theme:'Arts', lat:33.5298, lng:-117.6934,
      loc:'Laguna Niguel Lake, 28241 La Paz Rd, Laguna Niguel, CA 92677',
      max:12, creator:L[5], expires:daysFromNow(7),
      others:[L[0],L[1],L[2],L[3],L[4],L[6],L[7],L[8],L[9],L[10]],
    },
    {
      title:'Morning Yoga at Crown Valley Community Park',
      description:'Relaxing outdoor vinyasa yoga session. Bring your mat. All levels welcome.',
      theme:'Wellness', lat:33.5356, lng:-117.7012,
      loc:'29751 Crown Valley Pkwy, Laguna Niguel, CA 92677',
      max:15, creator:L[3], expires:daysFromNow(3),
      others:[L[0],L[1],L[2],L[4],L[5]],
    },
    {
      title:'Trail Run – Laguna Niguel Regional Park Loop',
      description:'5-mile trail run around the lake. Moderate pace, trail shoes recommended.',
      theme:'Sports', lat:33.5234, lng:-117.7076,
      loc:'28241 La Paz Rd, Laguna Niguel, CA 92677',
      max:20, creator:L[7], expires:daysFromNow(5),
      others:[L[0],L[1],L[10],L[19]],
    },
    {
      title:'Cycling Group – Pacific Island Dr to Dana Point',
      description:'Scenic 18-mile road bike ride through Laguna Niguel and Dana Point coast.',
      theme:'Sports', lat:33.5167, lng:-117.7089,
      loc:'Pacific Island Dr, Laguna Niguel, CA 92677',
      max:12, creator:L[10], expires:daysFromNow(8),
      others:[L[0],L[7],L[11],L[19]],
    },
    {
      title:'Book Club – "The Lincoln Highway"',
      description:'Monthly book club discussion. Coffee provided. Newcomers welcome!',
      theme:'Social', lat:33.5287, lng:-117.7089,
      loc:'30341 Crown Valley Pkwy, Laguna Niguel, CA 92677',
      max:10, creator:L[13], expires:daysFromNow(9),
      others:[L[0],L[5],L[15]],
    },
    {
      title:'Board Games Night – Town Center Café',
      description:'Bring your favorite board games or play ours. Great for meeting new friends!',
      theme:'Social', lat:33.5312, lng:-117.7034,
      loc:'30100 Town Center Dr, Laguna Niguel, CA 92677',
      max:12, creator:L[16], expires:daysFromNow(6),
      others:[L[0],L[14],L[15]],
    },
    {
      title:'Salsa Dancing Lessons – Crown Valley Community Center',
      description:'Beginner salsa lessons with live music. No partner needed. $5 suggested donation.',
      theme:'Arts', lat:33.5367, lng:-117.7012,
      loc:'29751 Crown Valley Pkwy, Laguna Niguel, CA 92677',
      max:20, creator:L[17], expires:daysFromNow(7),
      others:[L[0],L[1],L[4]],
    },
    {
      title:'Open Water Swim – Salt Creek Beach',
      description:'Ocean swim session. Must be comfortable in open water. Lifeguard on duty.',
      theme:'Sports', lat:33.5023, lng:-117.7245,
      loc:'Salt Creek Beach, Dana Point, CA 92629',
      max:8, creator:L[18], expires:daysFromNow(4),
      others:[L[11]],
    },
    {
      title:'Mediterranean Cooking Class',
      description:'Learn to cook authentic Mediterranean dishes. Ingredients provided. Eat what you make!',
      theme:'Social', lat:33.5289, lng:-117.7056,
      loc:'Laguna Niguel Community Center, CA 92677',
      max:8, creator:L[15], expires:daysFromNow(10),
      others:[L[1],L[3]],
    },
    {
      title:'Chess Club – Crown Valley Library',
      description:'Casual chess games, all skill levels. Analyze games and discuss strategy.',
      theme:'Social', lat:33.5287, lng:-117.7089,
      loc:'30341 Crown Valley Pkwy, Laguna Niguel, CA 92677',
      max:10, creator:L[14], expires:daysFromNow(8),
      others:[],
    },
  ];

  const lagunaEventIds: number[] = [];
  for (const m of lagunaEvents) {
    const res = await db.execute(sql`
      INSERT INTO meetups (title, description, theme, latitude, longitude, exact_location,
                           max_participants, creator_id, expires_at, is_private, created_at)
      VALUES (${m.title}, ${m.description}, ${m.theme}, ${m.lat}, ${m.lng}, ${m.loc},
              ${m.max}, ${m.creator}, ${m.expires}, false, NOW())
      RETURNING id
    `);
    const mid = (res.rows[0] as any).id;
    lagunaEventIds.push(mid);
    await db.execute(sql`INSERT INTO meetup_participants (meetup_id, user_id, created_at) VALUES (${mid}, ${m.creator}, NOW()) ON CONFLICT DO NOTHING`);
    for (const uid of m.others) {
      if (uid !== m.creator) {
        await db.execute(sql`INSERT INTO meetup_participants (meetup_id, user_id, created_at) VALUES (${mid}, ${uid}, NOW()) ON CONFLICT DO NOTHING`);
      }
    }
  }
  log(`[seed] Created ${lagunaEventIds.length} Laguna meetups`);

  // ── Irvine / Tustin users ──────────────────────────────────────────────────
  const irvineUserDefs = [
    { username:'kevin_uci',      displayName:'Kevin Tran',       gender:'male',   bio:'UCI grad, software engineer at a Spectrum startup' },
    { username:'diana_irvine',   displayName:'Diana Yoo',        gender:'female', bio:'Product manager, Woodbridge neighbor' },
    { username:'marcus_tustin',  displayName:'Marcus Bell',      gender:'male',   bio:'Tustin Ranch local, obsessed with golf and cycling' },
    { username:'preethi_oc',     displayName:'Preethi Sharma',   gender:'female', bio:'Data scientist, trail runner on Jeffrey Open Space' },
    { username:'zach_great_pk',  displayName:'Zach Cooper',      gender:'male',   bio:'Great Park flag football league veteran' },
    { username:'lisa_irvine',    displayName:'Lisa Hoffmann',    gender:'female', bio:'UX designer and urban sketching enthusiast' },
    { username:'ben_peters',     displayName:'Ben Nakamura',     gender:'male',   bio:'Hiker and birder at Peters Canyon every weekend' },
    { username:'rachel_oc_biz',  displayName:'Rachel Okonkwo',   gender:'female', bio:'Small business owner in Old Town Tustin' },
    { username:'chris_spectrum', displayName:'Chris Delgado',    gender:'male',   bio:'Board game collector, Irvine Spectrum regular' },
    { username:'heather_yoga',   displayName:'Heather Lin',      gender:'female', bio:'Certified yoga and pilates instructor' },
    { username:'dave_cyclist',   displayName:'Dave Marcello',    gender:'male',   bio:'Road cyclist on OC loop, UCI cycling club alumni' },
    { username:'nina_tustin',    displayName:'Nina Flores',      gender:'female', bio:'Foodie and Farmers Market regular in Old Town Tustin' },
    { username:'alex_mason_pk',  displayName:'Alex Pham',        gender:'male',   bio:'William Mason Park tennis captain' },
    { username:'jenny_coding',   displayName:'Jenny Wu',         gender:'female', bio:'Full-stack dev, runs weekly coding meetups' },
    { username:'sam_bball',      displayName:'Sam Jefferson',    gender:'male',   bio:'Basketball player, Irvine community court regular' },
    { username:'mei_irvine',     displayName:'Mei Watanabe',     gender:'female', bio:'Watercolor artist and Irvine arts scene regular' },
    { username:'rob_oc_chef',    displayName:'Rob Castro',       gender:'male',   bio:"Home chef inspired by Irvine's diverse food scene" },
    { username:'ashley_improv',  displayName:'Ashley Grant',     gender:'female', bio:'Improv comedy fan and Orange County theater volunteer' },
    { username:'tom_oc_runs',    displayName:'Tom Riordan',      gender:'male',   bio:'Half-marathon runner training around the Great Park' },
    { username:'grace_uci_bio',  displayName:'Grace Kim',        gender:'female', bio:'UCI biology PhD student and science communicator' },
  ];

  const irvineIds: number[] = [];
  for (const u of irvineUserDefs) {
    const res = await db.execute(sql`
      INSERT INTO users (username, display_name, gender, bio, password, created_at)
      VALUES (${u.username}, ${u.displayName}, ${u.gender}, ${u.bio}, ${pw}, NOW())
      ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `);
    irvineIds.push((res.rows[0] as any).id);
  }
  log(`[seed] Created/updated ${irvineIds.length} Irvine users`);

  const I = irvineIds;
  const irvineEvents = [
    {
      title:'Tennis Round-Robin at William Mason Regional Park',
      description:"Mixed-skill round-robin tournament on Mason Park's courts. Bring your own racket; balls provided. We rotate partners every set so everyone meets everyone.",
      theme:'Sports', lat:33.6700, lng:-117.7918,
      loc:'William Mason Regional Park, 18712 University Dr, Irvine, CA 92612',
      max:8, creator:I[12], expires:daysFromNow(4, 8),
      others:[I[0],I[3],I[4],I[10],I[13],I[18],I[19]],
    },
    {
      title:'Tustin Ranch Golf Scramble',
      description:'9-hole scramble format at Tustin Ranch Golf Club. All handicaps welcome. Cart fee split by the group. Tee time confirmed for sunrise.',
      theme:'Sports', lat:33.7454, lng:-117.7990,
      loc:'Tustin Ranch Golf Club, 12442 Tustin Ranch Rd, Tustin, CA 92782',
      max:12, creator:I[2], expires:daysFromNow(5, 7),
      others:[I[0],I[3],I[4],I[5],I[6],I[8],I[10],I[13],I[15],I[17],I[18]],
    },
    {
      title:'Peters Canyon Sunrise Hike & Bird Watch',
      description:'Moderate 4-mile loop through Peters Canyon Regional Park. We stop to identify raptors and songbirds at the lower lake. Bring water and binoculars if you have them.',
      theme:'Outdoors', lat:33.7540, lng:-117.7726,
      loc:'Peters Canyon Regional Park, 8548 E Canyon View Ave, Orange, CA 92869',
      max:12, creator:I[6], expires:daysFromNow(3, 6),
      others:[I[0],I[1],I[3],I[4],I[5],I[11],I[16],I[18],I[19]],
    },
    {
      title:'Jeffrey Open Space Trail Group Run',
      description:'Easy-to-moderate 6-mile out-and-back on the Jeffrey Open Space Trail. Flat, paved path — perfect for tempo runs or social jogging. We finish at the parking lot and stretch together.',
      theme:'Sports', lat:33.7200, lng:-117.7723,
      loc:'Jeffrey Open Space Trail, Jeffrey Rd & Portola Pkwy, Irvine, CA 92618',
      max:15, creator:I[3], expires:daysFromNow(6, 7),
      others:[I[0],I[1],I[4],I[10],I[13],I[14],I[15],I[17],I[18],I[19],I[7],I[11],I[5]],
    },
    {
      title:'Great Park Farmers Market Morning Walk',
      description:'Meet at the Orange County Great Park Farmers Market, stroll the stalls together, grab coffee and local produce, then relax on the Great Lawn. Casual and family-friendly.',
      theme:'Social', lat:33.6781, lng:-117.7409,
      loc:'OC Great Park Farmers Market, 6950 Marine Way, Irvine, CA 92618',
      max:20, creator:I[11], expires:daysFromNow(2, 8),
      others:[I[0],I[1],I[5],I[7],I[15],I[16],I[19]],
    },
    {
      title:'UCI Campus Cycling Tour',
      description:"Guided 12-mile bike loop starting at Aldrich Park, winding through UCI's scenic ring road and the Anteater Recreation Center paths. Bike rental available on-site. All paces welcome.",
      theme:'Sports', lat:33.6405, lng:-117.8443,
      loc:'Aldrich Park, UC Irvine, Irvine, CA 92697',
      max:16, creator:I[10], expires:daysFromNow(7, 8),
      others:[I[0],I[2],I[4],I[13],I[18],I[19]],
    },
    {
      title:'Irvine Spectrum Sketch Night',
      description:"Urban sketching session around the Irvine Spectrum Center. We'll capture the architecture, the Ferris wheel, and the evening crowds in pen and watercolor. All skill levels, supplies welcome.",
      theme:'Arts', lat:33.6503, lng:-117.7430,
      loc:'Irvine Spectrum Center, 670 Spectrum Center Dr, Irvine, CA 92618',
      max:12, creator:I[5], expires:daysFromNow(5, 18),
      others:[I[1],I[14],I[15],I[16]],
    },
    {
      title:'Basketball Pickup at Woodbridge High School Courts',
      description:'5-on-5 pickup runs at the outdoor courts. We play until dark. Show up anytime — teams are formed on the spot. Water fountain on-site.',
      theme:'Sports', lat:33.6792, lng:-117.8241,
      loc:'Woodbridge High School, 2 Meadowbrook, Irvine, CA 92604',
      max:20, creator:I[14], expires:daysFromNow(3, 17),
      others:[I[0],I[2],I[4],I[8],I[17]],
    },
    {
      title:'Coding & Career Night – Irvine Tech Hub',
      description:'Weekly lightning-talk meetup for OC engineers, designers, and product people. Two 10-min talks, open mic Q&A, and networking. This week: AI tools in everyday dev workflows.',
      theme:'Social', lat:33.6712, lng:-117.7749,
      loc:'The Cove at UCI Applied Innovation, 5141 California Ave, Irvine, CA 92697',
      max:40, creator:I[13], expires:daysFromNow(4, 18),
      others:[I[0],I[1],I[3],I[5],I[9],I[19]],
    },
    {
      title:'Outdoor Yoga – Woodbridge Village Lake',
      description:'Gentle vinyasa flow on the grass by Woodbridge North Lake. Bring your mat and a towel. Session ends with a 10-min meditation. All levels, drop-ins welcome.',
      theme:'Wellness', lat:33.6835, lng:-117.8252,
      loc:'Woodbridge North Lake, 20 Lake Rd, Irvine, CA 92604',
      max:15, creator:I[9], expires:daysFromNow(3, 7),
      others:[I[1],I[7]],
    },
    {
      title:'Old Town Tustin Food & History Walk',
      description:"Self-guided group tour of Old Town Tustin: we hit the bungalow storefronts, Zov's Bistro, the Tustin Legacy hangars viewpoint, and close with dessert at Tutti Frutti. Flat walking, ~1.5 miles total.",
      theme:'Social', lat:33.7458, lng:-117.8260,
      loc:'Old Town Tustin, El Camino Real & Main St, Tustin, CA 92780',
      max:12, creator:I[7], expires:daysFromNow(8, 10),
      others:[I[11],I[15]],
    },
    {
      title:'Watercolor Painting Class – Irvine Community Park',
      description:'Learn wet-on-wet landscape watercolor techniques in a relaxed outdoor setting. Basic supplies included; feel free to bring your own. Great for absolute beginners.',
      theme:'Arts', lat:33.7134, lng:-117.7944,
      loc:'Irvine Community Park, 4 Civic Center Plaza, Irvine, CA 92606',
      max:10, creator:I[15], expires:daysFromNow(9, 10),
      others:[I[5]],
    },
    {
      title:"Board Game Afternoon – Irvine Spectrum Barnes & Noble Café",
      description:"Bring your favorite strategy or party game and we'll share! Current favorites in the rotation: Wingspan, Ticket to Ride, and Codenames. Coffee shop ambiance, no pressure.",
      theme:'Social', lat:33.6510, lng:-117.7440,
      loc:'Barnes & Noble Café, Irvine Spectrum Center, Irvine, CA 92618',
      max:10, creator:I[8], expires:daysFromNow(6, 14),
      others:[I[17]],
    },
    {
      title:'OC Improv Comedy Workshop – Brea Improv Warmup',
      description:'Intro improv session for anyone curious about "yes, and" techniques. No experience needed. We do warm-up games, scene work, and debrief. Hosted in Irvine before the Brea Improv show.',
      theme:'Arts', lat:33.6625, lng:-117.7700,
      loc:'Heritage Community Park, 14301 Yale Ave, Irvine, CA 92604',
      max:16, creator:I[17], expires:daysFromNow(10, 19),
      others:[],
    },
  ];

  const irvineEventIds: number[] = [];
  for (const m of irvineEvents) {
    const res = await db.execute(sql`
      INSERT INTO meetups (title, description, theme, latitude, longitude, exact_location,
                           max_participants, creator_id, expires_at, is_private, created_at)
      VALUES (${m.title}, ${m.description}, ${m.theme}, ${m.lat}, ${m.lng}, ${m.loc},
              ${m.max}, ${m.creator}, ${m.expires}, false, NOW())
      RETURNING id
    `);
    const mid = (res.rows[0] as any).id;
    irvineEventIds.push(mid);
    await db.execute(sql`INSERT INTO meetup_participants (meetup_id, user_id, created_at) VALUES (${mid}, ${m.creator}, NOW()) ON CONFLICT DO NOTHING`);
    for (const uid of m.others) {
      if (uid !== m.creator) {
        await db.execute(sql`INSERT INTO meetup_participants (meetup_id, user_id, created_at) VALUES (${mid}, ${uid}, NOW()) ON CONFLICT DO NOTHING`);
      }
    }
  }
  log(`[seed] Created ${irvineEventIds.length} Irvine/Tustin meetups`);

  return { lagunaEventIds, irvineEventIds };
}

async function seedSocial(usernameToId: Record<string, number>, lagunaIds: number[], irvineIds: number[]) {
  const traitDefs = [
    { name:'Friendly', category:'Social' }, { name:'Punctual', category:'Character' },
    { name:'Athletic', category:'Physical' }, { name:'Creative', category:'Arts' },
    { name:'Adventurous', category:'Outdoors' }, { name:'Reliable', category:'Character' },
    { name:'Funny', category:'Social' }, { name:'Knowledgeable', category:'Intellectual' },
    { name:'Energetic', category:'Physical' }, { name:'Calm', category:'Character' },
    { name:'Motivating', category:'Social' }, { name:'Team Player', category:'Social' },
  ];
  const traitIds: Record<string, number> = {};
  for (const t of traitDefs) {
    const res = await db.execute(sql`
      INSERT INTO traits (name, category) VALUES (${t.name}, ${t.category})
      ON CONFLICT (name) DO UPDATE SET category=EXCLUDED.category RETURNING id
    `);
    traitIds[t.name] = (res.rows[0] as any).id;
  }

  const profiles: Record<string, { traits: string[]; level: string }> = {
    alex_laguna:   { traits:['Friendly','Athletic','Adventurous','Energetic','Team Player'], level:'legend' },
    amy_runner:    { traits:['Athletic','Energetic','Motivating','Punctual','Reliable','Team Player'], level:'legend' },
    ryan_cycle:    { traits:['Athletic','Energetic','Adventurous','Punctual','Motivating','Team Player'], level:'legend' },
    kevin_uci:     { traits:['Knowledgeable','Funny','Friendly','Motivating','Team Player'], level:'legend' },
    rachel_oc_biz: { traits:['Motivating','Reliable','Knowledgeable','Punctual','Friendly','Team Player'], level:'legend' },
    sarah_beach:   { traits:['Calm','Creative','Friendly','Knowledgeable','Reliable'], level:'expert' },
    priya_yoga:    { traits:['Calm','Knowledgeable','Friendly','Creative'], level:'expert' },
    jen_art:       { traits:['Creative','Friendly','Knowledgeable','Calm'], level:'expert' },
    ethan_climb:   { traits:['Adventurous','Athletic','Reliable','Energetic','Funny'], level:'expert' },
    james_swim:    { traits:['Athletic','Team Player','Motivating','Punctual'], level:'expert' },
    diana_irvine:  { traits:['Creative','Friendly','Knowledgeable','Calm','Reliable'], level:'expert' },
    zach_great_pk: { traits:['Adventurous','Athletic','Funny','Energetic','Motivating'], level:'expert' },
    chris_spectrum:{ traits:['Adventurous','Energetic','Funny','Team Player','Athletic'], level:'expert' },
    jenny_coding:  { traits:['Knowledgeable','Creative','Motivating','Reliable','Funny'], level:'expert' },
    tom_oc_runs:   { traits:['Athletic','Energetic','Punctual','Motivating','Team Player'], level:'expert' },
    ashley_improv: { traits:['Funny','Creative','Friendly','Energetic','Motivating'], level:'expert' },
    mike_tennis:   { traits:['Athletic','Energetic','Punctual','Team Player'], level:'regular' },
    tom_hiker:     { traits:['Adventurous','Reliable','Knowledgeable','Calm'], level:'regular' },
    carlos_golf:   { traits:['Punctual','Reliable','Athletic'], level:'regular' },
    dan_photo:     { traits:['Creative','Adventurous','Knowledgeable'], level:'regular' },
    mia_surf:      { traits:['Friendly','Athletic','Energetic','Adventurous'], level:'regular' },
    olivia_book:   { traits:['Knowledgeable','Creative','Friendly','Reliable'], level:'regular' },
    emma_cook:     { traits:['Creative','Friendly','Funny'], level:'regular' },
    ava_dance:     { traits:['Creative','Energetic','Friendly','Motivating'], level:'regular' },
    marcus_tustin: { traits:['Athletic','Team Player','Energetic'], level:'regular' },
    preethi_oc:    { traits:['Calm','Knowledgeable','Reliable'], level:'regular' },
    lisa_irvine:   { traits:['Friendly','Creative','Calm'], level:'regular' },
    heather_yoga:  { traits:['Calm','Friendly','Knowledgeable','Creative'], level:'regular' },
    dave_cyclist:  { traits:['Athletic','Energetic','Adventurous','Punctual'], level:'regular' },
    nina_tustin:   { traits:['Creative','Friendly','Funny'], level:'regular' },
    sam_bball:     { traits:['Athletic','Team Player','Energetic','Funny'], level:'regular' },
    lisa_garden:   { traits:['Calm','Creative','Knowledgeable'], level:'newcomer' },
    noah_chess:    { traits:['Knowledgeable','Calm','Funny'], level:'newcomer' },
    liam_board:    { traits:['Funny','Team Player','Energetic'], level:'newcomer' },
    sophia_run:    { traits:['Athletic','Energetic','Motivating'], level:'newcomer' },
    alex_mason_pk: { traits:['Adventurous','Athletic','Reliable'], level:'newcomer' },
    mei_irvine:    { traits:['Friendly','Creative','Calm'], level:'newcomer' },
    rob_oc_chef:   { traits:['Creative','Funny','Friendly'], level:'newcomer' },
    grace_uci_bio: { traits:['Knowledgeable','Reliable','Calm'], level:'newcomer' },
    ben_peters:    { traits:['Knowledgeable','Reliable','Punctual'], level:'newcomer' },
  };

  const endorseRange: Record<string, number> = { legend:7, expert:5, regular:3, newcomer:2 };
  const negTargets: Record<string, number> = { legend:4, expert:5, regular:4, newcomer:3 };
  const allUserIds = Object.values(usernameToId).filter(Boolean);

  let traitRows = 0, negRows = 0;

  for (const [username, profile] of Object.entries(profiles)) {
    const userId = usernameToId[username];
    if (!userId) continue;
    const isLaguna = LAGUNA_USERNAMES.includes(username);
    const homeMeetups = isLaguna ? lagunaIds : irvineIds;
    const numEndorsers = endorseRange[profile.level];
    const otherUsers = allUserIds.filter(u => u !== userId);
    const endorsers = pick(otherUsers, Math.min(numEndorsers, otherUsers.length));
    const meetupPool = pick(homeMeetups, Math.min(numEndorsers, homeMeetups.length));

    for (const traitName of profile.traits) {
      const tId = traitIds[traitName];
      for (let i = 0; i < endorsers.length; i++) {
        const endorserId = endorsers[i];
        const meetupId = meetupPool[i % meetupPool.length];
        try {
          await db.execute(sql`
            INSERT INTO user_traits (user_id, trait_id, endorser_id, meetup_id, endorsement_count)
            VALUES (${userId}, ${tId}, ${endorserId}, ${meetupId}, 1)
            ON CONFLICT (user_id, trait_id, endorser_id, meetup_id) DO NOTHING
          `);
          traitRows++;
        } catch {}
      }
    }

    // Negative votes — use cross-group users
    const crossUsernames = isLaguna ? IRVINE_USERNAMES : LAGUNA_USERNAMES;
    const crossUsers = pick(crossUsernames.map(u => usernameToId[u]).filter(Boolean), 6);
    const negPool = pick(homeMeetups, 6);
    const target = negTargets[profile.level];
    let added = 0;

    const userTraitsRes = await db.execute(sql`
      SELECT DISTINCT trait_id FROM user_traits WHERE user_id=${userId} AND endorsement_count > 0
    `);
    const shuffledTraits = [...userTraitsRes.rows].sort(() => Math.random() - 0.5);

    for (let ti = 0; ti < shuffledTraits.length && added < target; ti++) {
      const traitId = (shuffledTraits[ti] as any).trait_id;
      const endorserId = crossUsers[ti % crossUsers.length];
      const meetupId = negPool[ti % negPool.length];
      if (!endorserId || !meetupId || endorserId === userId) continue;
      try {
        const r = await db.execute(sql`
          INSERT INTO user_traits (user_id, trait_id, endorser_id, meetup_id, endorsement_count)
          VALUES (${userId}, ${traitId}, ${endorserId}, ${meetupId}, -1)
          ON CONFLICT (user_id, trait_id, endorser_id, meetup_id) DO NOTHING RETURNING id
        `);
        if ((r.rowCount ?? 0) > 0) { negRows++; added++; }
      } catch {}
    }
  }
  log(`[seed] Endorsements: ${traitRows} positive, ${negRows} negative`);

  // Meet history
  const meetsByLevel: Record<string, number[]> = {
    legend:[28,32,30,25,29], expert:[18,14,16,20,13,15,17,19,12],
    regular:[9,7,11,6,8,10,9,7,6,8,11,7,9,6,10], newcomer:[3,2,4,1,3,2,4,1,2],
  };
  const levelIdx: Record<string, number> = { legend:0, expert:0, regular:0, newcomer:0 };
  let historyRows = 0;

  for (const [username, profile] of Object.entries(profiles)) {
    const userId = usernameToId[username];
    if (!userId) continue;
    const isLaguna = LAGUNA_USERNAMES.includes(username);
    const homeMeetups = isLaguna ? lagunaIds : irvineIds;
    const awayMeetups = isLaguna ? irvineIds : lagunaIds;
    const idx = levelIdx[profile.level]++;
    const numMeets = meetsByLevel[profile.level][idx % meetsByLevel[profile.level].length];
    const homeCount = Math.min(numMeets, homeMeetups.length);
    const awayCount = Math.min(Math.floor(numMeets * 0.2), awayMeetups.length);
    const chosen = [...pick(homeMeetups, homeCount), ...pick(awayMeetups, awayCount)].slice(0, numMeets);
    let dayOffset = 1;
    for (const meetupId of chosen) {
      const joinedAt = daysAgo(dayOffset + randInt(0, 3));
      const leftAt = new Date(joinedAt.getTime() + randInt(1, 3) * 3600000);
      dayOffset += randInt(3, 12);
      try {
        await db.execute(sql`
          INSERT INTO meet_history (user_id, meetup_id, joined_at, left_at) VALUES (${userId}, ${meetupId}, ${joinedAt}, ${leftAt}) ON CONFLICT DO NOTHING
        `);
        historyRows++;
      } catch {}
    }
    await db.execute(sql`UPDATE users SET meets_attended_count=${numMeets} WHERE id=${userId}`);
  }
  log(`[seed] Meet history: ${historyRows} rows`);

  // Friendships
  const friendPairs: [string, string][] = [
    ['alex_laguna','amy_runner'],['alex_laguna','ryan_cycle'],['alex_laguna','mia_surf'],['alex_laguna','ethan_climb'],
    ['amy_runner','ryan_cycle'],['amy_runner','james_swim'],['amy_runner','sophia_run'],
    ['ryan_cycle','james_swim'],['ryan_cycle','mike_tennis'],['ryan_cycle','tom_hiker'],
    ['ethan_climb','tom_hiker'],['ethan_climb','dan_photo'],['ethan_climb','mia_surf'],
    ['mia_surf','ava_dance'],['mia_surf','sarah_beach'],['james_swim','mike_tennis'],['james_swim','sophia_run'],
    ['tom_hiker','carlos_golf'],['tom_hiker','lisa_garden'],['jen_art','olivia_book'],
    ['jen_art','sarah_beach'],['jen_art','ava_dance'],['olivia_book','emma_cook'],
    ['olivia_book','lisa_garden'],['olivia_book','noah_chess'],['emma_cook','ava_dance'],
    ['emma_cook','liam_board'],['ava_dance','sarah_beach'],['ava_dance','priya_yoga'],
    ['noah_chess','lisa_garden'],['noah_chess','liam_board'],['liam_board','mike_tennis'],
    ['liam_board','carlos_golf'],['sarah_beach','priya_yoga'],['priya_yoga','lisa_garden'],
    ['carlos_golf','dan_photo'],['dan_photo','sophia_run'],
    ['kevin_uci','rachel_oc_biz'],['kevin_uci','diana_irvine'],['kevin_uci','jenny_coding'],['kevin_uci','zach_great_pk'],
    ['rachel_oc_biz','tom_oc_runs'],['rachel_oc_biz','jenny_coding'],['rachel_oc_biz','diana_irvine'],
    ['jenny_coding','diana_irvine'],['jenny_coding','grace_uci_bio'],['jenny_coding','ben_peters'],
    ['diana_irvine','heather_yoga'],['diana_irvine','preethi_oc'],
    ['grace_uci_bio','preethi_oc'],['grace_uci_bio','ben_peters'],
    ['ben_peters','preethi_oc'],['ben_peters','dave_cyclist'],
    ['zach_great_pk','chris_spectrum'],['zach_great_pk','sam_bball'],['zach_great_pk','tom_oc_runs'],
    ['chris_spectrum','sam_bball'],['chris_spectrum','dave_cyclist'],['chris_spectrum','marcus_tustin'],
    ['sam_bball','marcus_tustin'],['sam_bball','mei_irvine'],['sam_bball','rob_oc_chef'],
    ['marcus_tustin','dave_cyclist'],['marcus_tustin','alex_mason_pk'],
    ['dave_cyclist','alex_mason_pk'],['dave_cyclist','tom_oc_runs'],
    ['tom_oc_runs','ashley_improv'],['ashley_improv','nina_tustin'],['ashley_improv','rob_oc_chef'],
    ['ashley_improv','lisa_irvine'],['nina_tustin','lisa_irvine'],['nina_tustin','mei_irvine'],
    ['mei_irvine','heather_yoga'],['mei_irvine','lisa_irvine'],['rob_oc_chef','heather_yoga'],
    ['heather_yoga','preethi_oc'],['alex_mason_pk','chris_spectrum'],
    ['alex_laguna','zach_great_pk'],['alex_laguna','chris_spectrum'],
    ['amy_runner','tom_oc_runs'],['ryan_cycle','dave_cyclist'],['ethan_climb','alex_mason_pk'],
    ['james_swim','sam_bball'],['sarah_beach','diana_irvine'],['jen_art','ashley_improv'],
    ['olivia_book','jenny_coding'],['priya_yoga','heather_yoga'],['ava_dance','ashley_improv'],
    ['sophia_run','marcus_tustin'],['mia_surf','mei_irvine'],['lisa_garden','mei_irvine'],
  ];
  let friendRows = 0;
  for (const [a, b] of friendPairs) {
    const aId = usernameToId[a], bId = usernameToId[b];
    if (!aId || !bId) continue;
    try {
      await db.execute(sql`INSERT INTO friends (user_id, friend_id) VALUES (${aId},${bId}),(${bId},${aId}) ON CONFLICT DO NOTHING`);
      friendRows += 2;
    } catch {}
  }
  log(`[seed] Friends: ${Math.round(friendRows/2)} pairs`);
}

export async function runStartupSeed() {
  try {
    const meetupResult = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM meetups
      WHERE expires_at >= NOW()
    `);
    const meetupCount = parseInt((meetupResult.rows[0] as any).cnt, 10);

    let lagunaEventIds: number[] = [];
    let irvineEventIds: number[] = [];

    if (meetupCount < 10) {
      log(`[seed] Only ${meetupCount} active meetups — adding a fresh event set...`);
      const result = await seedMeetups();
      lagunaEventIds = result.lagunaEventIds;
      irvineEventIds = result.irvineEventIds;
    } else {
      log(`[seed] ${meetupCount} active meetups already present — skipping meetup seed`);
      // Resolve existing meetup IDs by latitude
      const rows = await db.execute(sql`SELECT id, latitude FROM meetups ORDER BY id`);
      lagunaEventIds = (rows.rows as any[]).filter(m => parseFloat(m.latitude) < 33.60).map(m => m.id);
      irvineEventIds  = (rows.rows as any[]).filter(m => parseFloat(m.latitude) >= 33.60).map(m => m.id);
      if (!lagunaEventIds.length) lagunaEventIds = (rows.rows as any[]).slice(0, 14).map(m => m.id);
      if (!irvineEventIds.length)  irvineEventIds  = (rows.rows as any[]).slice(14).map(m => m.id);
    }

    const traitResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM traits`);
    const traitCount = parseInt((traitResult.rows[0] as any).cnt, 10);

    if (traitCount < 5) {
      log('[seed] No social data — seeding traits, endorsements, history, friends...');
      const userResult = await db.execute(sql`SELECT id, username FROM users`);
      const usernameToId: Record<string, number> = {};
      const allSet = new Set(ALL_USERNAMES);
      for (const r of userResult.rows as any[]) {
        if (allSet.has(r.username)) usernameToId[r.username] = r.id;
      }
      const found = Object.keys(usernameToId).length;
      if (found === 0) { log('[seed] No seeded users found — skipping social seed'); return; }
      log(`[seed] Found ${found} seeded users`);
      await seedSocial(usernameToId, lagunaEventIds, irvineEventIds);
      log('[seed] ✓ Social seed complete');
    } else {
      log(`[seed] ${traitCount} traits already present — skipping social seed`);
    }
  } catch (err: any) {
    log(`[seed] ⚠ Startup seed error: ${err.message}`);
    console.error(err);
  }
}
