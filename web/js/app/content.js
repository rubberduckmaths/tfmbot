// content.js -- names, descriptions and tables the UI shows: the maps with their milestones and awards,
// standard projects, tile and placement-bonus names, the named spaces' lore, milestone / award criteria.

// cards that take something from another player (on play, or as an action)
export const ATTACK_RE = /\b(remove|decrease|steal|reduce)\b[^.]*\bany (player|plant|energy|heat|M€|megacredit|steel|titanium)|\bfrom any player\b/i;
// the maps TFMBot plays (the engine's map ids)
export const MAPS = [
  { id: 0, key: 'tharsis', name: 'Tharsis', blurb: 'The classic board: the three great Tharsis volcanoes, Noctis City and the canyons of the Valles.',
    ms: ['Terraformer', 'Mayor', 'Gardener', 'Builder', 'Planner'], aw: ['Landlord', 'Banker', 'Scientist', 'Thermalist', 'Miner'] },
  { id: 1, key: 'hellas', name: 'Hellas', blurb: 'The great southern impact basin — deep lowlands made for oceans, and the frozen south pole.',
    ms: ['Diversifier', 'Tactician', 'Polar Explorer', 'Energizer', 'Rim Settler'], aw: ['Cultivator', 'Magnate', 'Space Baron', 'Eccentric', 'Contractor'] },
  { id: 2, key: 'elysium', name: 'Elysium', blurb: 'The volcanic province of Elysium Mons and its sister volcanoes above the northern plains.',
    ms: ['Generalist', 'Specialist', 'Ecologist', 'Tycoon', 'Legend'], aw: ['Celebrity', 'Industrialist', 'Desert Settler', 'Estate Dealer', 'Benefactor'] },
  { id: 7, key: 'vastitas-borealis-novus', name: 'Vastitas Borealis Novus', blurb: 'The vast northern plains running up to the polar ice cap.',
    ms: ['Agronomist', 'Engineer', 'Spacefarer', 'Geologist', 'Farmer'], aw: ['Traveller', 'Landscaper', 'Highlander', 'Promoter', 'Blacksmith'] },
];
export const MOOD_RANK = { none: 0, science: 1, nature: 2, city: 3, water: 4, space: 5, impact: 6 };
export const SP = [
  { name: 'Sell patents', cost: '+1/card', what: 'Discard a card for 1 M€' },
  { name: 'Power plant', cost: 11, what: '+1 energy production' },
  { name: 'Asteroid', cost: 14, what: 'Raise temperature' },
  { name: 'Aquifer', cost: 18, what: 'Place an ocean' },
  { name: 'Greenery', cost: 23, what: 'Place greenery, raise O₂' },
  { name: 'City', cost: 25, what: 'Place city, +1 M€ prod' },
];
export const TILE_NAME = { 0: 'ocean', 1: 'greenery', 2: 'city', 3: 'Capital', 4: 'Commercial District', 7: 'Lava Flows', 10: 'Mohole Area', 11: 'Natural Preserve', 12: 'Nuclear Zone', 13: 'Restricted Area', 14: 'Industrial Center', 15: 'Ecological Zone', 16: 'Mining Rights', 17: 'Mining Area' };
// engine TFM_BONUS_* ids; null = not shown (9: Turmoil delegate, not in our ruleset)
export const BONUS_NAME = ['steel', 'titanium', 'plant', 'card', 'heat', 'energy', 'animal', 'microbe', 'data', null, 'science',
  'place an ocean (pay 6 M€)', 'raise temperature 1 step (pay 3 M€)', 'energy production', 'raise temperature 1 step (pay 4 M€)'];
// a little (mostly fictional) history for the named spaces
export const LORE = {
  'Noctis City': 'Deep in the Noctis Labyrinthus, shielded from cosmic rays by kilometre-high canyon walls, the first settlers found the perfect spot for a city.',
  'Tharsis Tholus': 'An old shield volcano with a caved-in summit. Its lava tubes were the first shelters of the Tharsis survey crews, and they still hum with ventilation fans.',
  'Ascraeus Mons': 'The northernmost of the three Tharsis giants, 18 km high. Its summit caldera is where the first orbital elevator was surveyed and abandoned.',
  'Pavonis Mons': 'Sitting almost exactly on the equator, the "Peacock Mountain" is the natural anchor for a space elevator; the survey beacons on its flank still blink.',
  'Arsia Mons': 'The southern Tharsis volcano, wrapped in morning cloud banks. Its caldera shelters the oldest ice deposits in the region, fought over since the first water rights charter.',
  'Ganymede Colony': 'Jupiter\'s largest moon, bigger than Mercury. The colony sits in the bright grooved terrain, trading water ice and patience with the inner system.',
  'Phobos Space Haven': 'The inner moon of Mars, skimming 6,000 km above the surface. Its hollowed-out Stickney crater became the busiest dock between Mars and the belt.',
  // Elysium
  'Elysium Mons': 'The great volcano of the east, 12 km high and quiet for a few million years. Surveyors swear the summit is warmer than it should be; the geothermal consortium politely declines to comment.',
  'Hecates Tholus': 'Named for the goddess of crossroads and the night. Its flanks are carved by old glaciers, and the ice-miners who work them leave a lantern burning at the caldera rim for luck.',
  'Olympus Mons': 'The tallest volcano in the solar system: 22 km high and as wide as France. From the summit the horizon is so far away you cannot tell you are on a mountain at all. The view is still worth the three-week hike.',
  // Hellas
  'South Pole': 'Layer upon layer of water ice under a seasonal cap of dry ice. Every spring the CO₂ sublimates in dark geysers that the locals call "spiders" and the tourists pay good money to watch.',
  // Vastitas Borealis
  'Alba Mons': 'The broadest volcano on Mars, spreading over 1,000 km yet barely 7 km tall. A mountain you can walk up without noticing, which the Alba Hill-Walkers\u2019 Society counts as a feature.',
  'Uranius Tholus': 'A small, steep shield volcano sitting in the lee of its big brother Uranius Mons. The first automated weather station on the northern plains was bolted to its summit and still files a forecast every hour: dusty.',
  'Viking 1': 'The landing site of Viking 1, the first craft to work on the surface of Mars (1976). The lander is fenced off as a heritage site, and every new colonist is expected to leave one pebble at the gate.',
  'Viking 2': 'Where Viking 2 touched down on Utopia Planitia in 1976 and photographed frost on the rocks. The settlement grew up around the lander, and the frost is now celebrated every winter with a festival of very cold soup.',
  'North Pole': 'A cap of water ice nearly 3 km thick, streaked by spiral canyons carved by the wind. The ocean engineers call it "the reservoir", and they mean it.',
};
// Named spaces per map, by engine space index. Engine names are merged
// across maps, so Tharsis uses its own table and the others use MAP_LABELS (board/board3d.js).
export const THARSIS_NAMES = { 0: 'Ganymede Colony', 1: 'Phobos Space Haven', 8: 'Tharsis Tholus', 13: 'Ascraeus Mons', 20: 'Pavonis Mons', 28: 'Arsia Mons', 30: 'Noctis City' };
export const CRIT = {
  tr: 'Terraform rating', city_tiles: 'Cities', greenery_tiles: 'Greeneries', 'tag:building': 'Building tags', cards_in_hand: 'Cards in hand',
  non_ocean_tiles: 'Tiles owned (incl. off Mars)', 'prod:megacredits': 'M€ production', 'tag:science': 'Science tags', 'res:heat': 'Heat', 'res:steel+titanium': 'Steel + titanium',
  // Hellas
  distinct_tags: 'Different tags', cards_with_requirements: 'Cards with requirements', tiles_bottom_2_rows: 'Tiles in the 2 bottom rows',
  'prod:energy': 'Energy production', 'tag:jovian': 'Jovian tags', automated_cards: 'Automated (green) cards', 'tag:space': 'Space tags',
  'card_resources:all': 'Resources on cards',
  // Elysium
  all_productions_raised: 'Productions of 1 or more', max_single_production: 'Highest single production', 'tags:plant+microbe+animal': 'Plant + microbe + animal tags',
  project_cards_in_play: 'Blue + green cards', events_played: 'Events played', noncost_event_ge20: 'Non-event cards costing 20+ M€',
  'res:steel+energy': 'Steel + energy', tiles_bottom_4_rows: 'Tiles in the 4 bottom rows', tiles_adjacent_ocean: 'Tiles next to oceans',
  // Vastitas Borealis
  'tag:plant': 'Plant tags', 'prod:energy+heat': 'Energy + heat production', tiles_on_or_adj_volcanic: 'Tiles on or next to volcanic areas',
  'card_resources:animal+microbe': 'Animals + microbes on cards', 'tags:jovian+earth': 'Jovian + Earth tags', largest_contiguous_tiles: 'Largest group of your tiles',
  tiles_not_adjacent_ocean: 'Tiles not next to oceans', 'prod:steel+titanium': 'Steel + titanium production',
};
