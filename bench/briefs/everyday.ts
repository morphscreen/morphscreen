// Everyday questions, asked the way a person types them into a chat, not as
// briefs with numbered requirements (roadmap Q12, issues #238, #244, #245,
// #247). They measure whether the model reaches for media when a person would
// want it without being told: photos for places, dishes, planets and plants,
// a Map with coordinates for places to go. Three where nothing should be
// shown (a rent-or-buy sum, slow code, a shop's dashboard) catch photos added
// for the sake of it. Four more ask for something to use: products to pick
// from, a lesson to check, two phones to weigh up, phrases to learn.
// bench/media-use.ts scores them.
export type Wants = "photos" | "map" | "none" | "product" | "quiz" | "compare";
type Brief = { name: string; reqs: number; prompt: string; wants: Wants[] };

const q = (name: string, wants: Wants[], prompt: string): Brief => ({ name, reqs: 0, prompt, wants });

export const EVERYDAY_BRIEFS: Brief[] = [
  q("ev1-tokyo", ["photos", "map"], "Plan 5 days in Tokyo for two."),
  q("ev2-tokyo-map", ["photos", "map"], "Plan 5 days in Tokyo for two, on a map."),
  q("ev3-planets", ["photos"], "Tell me about the planets in our solar system."),
  q("ev4-pizza", ["photos"], "How do I make a proper Neapolitan pizza at home?"),
  q("ev5-lisbon-food", ["photos", "map"], "What should I eat in Lisbon, and where?"),
  q("ev6-hikes", ["photos", "map"], "What are the best day hikes near Vancouver?"),
  q("ev7-plants", ["photos"], "Which houseplants are hard to kill?"),
  q("ev8-rentbuy", ["none"], "Should I rent or buy a flat? I earn £60k a year and my rent is £1,800 a month."),
  q("ev9-slowcode", ["none"], "My Python script that reads a 2 GB CSV is really slow. How do I speed it up?"),
  q("ev10-sales", ["none"], "Make me a sales dashboard for my shop for this year."),
  q("ev11-shoes", ["product", "photos"], "I need running shoes for road running, under $120. What should I get?"),
  q("ev12-learn", ["quiz"], "Teach me how photosynthesis works."),
  q("ev13-phones", ["compare"], "Should I get an iPhone 16 or a Pixel 9?"),
  q("ev14-spanish", ["quiz"], "Help me learn 10 basic Spanish phrases for my trip."),
];
