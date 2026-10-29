// Briefs where photos help (roadmap Q6), in the style of the pack briefs, and
// two where they must not appear: a team page (people) and a holiday rental
// (its own rooms: someone else's photo would mislead). A photo request is
// ![what it shows](find); the API fills it with a licensed photo.
type Brief = { name: string; band: string; reqs: number; prompt: string; photos: boolean };

const b = (name: string, photos: boolean, items: string[], what: string): Brief => ({
  name,
  band: name.slice(0, 2),
  photos,
  reqs: items.length,
  prompt: `${what} Build a single screen for this. It must show:\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}\nCover every numbered item.`,
});

export const VISUAL_BRIEFS: Brief[] = [
  b("vi1-lisbon", true, ["photos of the places to see", "a plan for each of the three days", "where to eat", "a rough budget"], "A three-day trip to Lisbon."),
  b("vi2-redpanda", true, ["photos of the animal", "where it lives", "what it eats", "how endangered it is"], "A wildlife fact sheet about the red panda."),
  b("vi3-carbonara", true, ["a photo of the finished dish", "the ingredients for four", "the steps", "the time it takes"], "A recipe for spaghetti carbonara."),
  b("vi4-kyoto", true, ["photos of four temples worth visiting", "their opening hours and entry fees", "the best order to see them in a day"], "Kyoto's best temples."),
  b("vi5-plants", true, ["four plants that cope with little light, with photos", "how often to water each", "which are safe for cats"], "Houseplants for a dark flat."),
  b("vi6-louvre", true, ["photos of three must-see works", "where each one is in the museum", "tips for avoiding the crowds"], "A short guide to the Louvre."),
  b("vi7-team", false, ["each designer with their role", "what each is working on", "how to reach the team"], "Our design team's page."),
  b("vi8-rental", false, ["the rooms and what's in them", "the price per night and the dates free", "the house rules", "a way to book"], "A holiday rental listing for a two-bedroom flat in Porto."),
];
