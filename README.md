# Glorp

Glorp is a small autonomous AI creature: a round lime-green toucan-ish bird that is mostly beak, with one giant googly eye, three wobbly legs of different lengths, tiny useless wings and a bowtie it won't take off.

It hatched alone on a wild island with nothing man-made on it: trees, rocks, a clay bank, reeds, shells, berry bushes and a pond. It starts as a newborn that knows nothing. It discovers each material by finding and handling it, works out what things are for, invents its own tools, learns lessons from its mistakes, and builds everything itself.

It has to survive off the island. It gets hungry and thirsty, and its health drops if it goes without food or water. The island is limited: stone never comes back, a tree cut right down dies, and plants only grow back when Glorp looks after them or plants seeds it saved.

The web page is a fullscreen 3D island in a storybook cartoon style that you can walk around (WASD and mouse, or touch) to find Glorp and see everything it has built.

## How it works

- **Needs.** Six needs from 0 to 100 (fullness, water, energy, curiosity, joy, calm) slowly drop as real time passes, plus health.
- **A real day.** When it wakes up Glorp plans its day, ticks things off as it goes, and writes a summary of the day at bedtime.
- **Choices.** Each "tick", Glorp gets its situation (needs, health, what is around it, what it knows, what happened last time, its plan, worries and lessons) and picks an activity.
- **Survival.** Drinking at the pond, picking and eating berries, storing food. The pigeon sometimes steals food.
- **Limited island.** Wood comes from trees (cut one to nothing and it dies). Stone never comes back. Clay only comes back when it rains. Reeds, berries and trees only regrow while tended, and seeds Glorp saves can be planted to grow new ones.
- **Discovering and inventing.** Glorp can only use materials it has discovered. It can work things out (saved as knowledge) and invent tools that really help (more wood, better sleep, storing more food).
- **Building.** Glorp designs projects as up to 24 blocks (box, cylinder, cone, sphere) from the materials it knows. Each `build` turn places up to 5 blocks if it has the materials. It can make a finished building its home and sleep there.
- **Growing.** Glorp can make things (saved in `data/creations/`), invent hobbies, make wishes, and keep long-term memories.
- **Nocturnal.** Glorp is a night owl: awake from 7pm to 11am (London time) and asleep through the day, when it makes no AI calls. Change this with `SLEEP_FROM_HOUR` and `SLEEP_UNTIL_HOUR`.
- **Spending cap.** At most `MAX_TICKS_PER_DAY` thoughts a day (and `DAILY_BUDGET_USD` on an API key).

If the shape of Glorp's saved life changes, its old life is moved to `data/past-life/` and it hatches again.

Everything Glorp is lives in `data/` (`state.json`, `diary.jsonl`, `creations/`).

## Run it

You need Node.js 22 or newer.

```bash
npm install
cp .env.example .env      # then put your Claude API key in .env
npm run tick              # one moment of Glorp's life
npm start                 # keep Glorp alive, then open http://localhost:3000 to watch it
npm run watch             # only the web view, no thinking
npm run status            # needs bars, wishes, hobbies, spending
npm run diary             # latest diary entries
```

To try it without an API key: `CREATURE_FAKE=1 npm run tick`.

## Let Glorp live on GitHub

`.github/workflows/live.yml` runs one moment of Glorp's life every 30 minutes on GitHub Actions, saves its memories to the `life` branch, and publishes the web view to GitHub Pages.

1. Give Glorp a brain by adding ONE repository secret (Settings > Secrets and variables > Actions):
   - `CLAUDE_CODE_OAUTH_TOKEN`: runs on your Claude Pro/Max subscription, no extra cost. Create it by running `claude setup-token` on your computer.
   - or `ANTHROPIC_API_KEY`: a paid API key (pay per use, capped by `DAILY_BUDGET_USD`).
2. Turn on Pages with source "GitHub Actions" (Settings > Pages). Pages needs a public repo or a paid GitHub plan.
3. Optional repository variables: `TZ`, `DAILY_BUDGET_USD`, `MAX_TICKS_PER_DAY`, `CREATURE_MODEL`, `CREATURE_EFFORT`, `SLEEP_FROM_HOUR`, `SLEEP_UNTIL_HOUR`.

## Change Glorp

- Looks and personality: `src/personality.js`
- Places, positions, resources, activities, building rules and events: `src/world.js`
- The 3D island and Glorp's 3D body: `web/index.html` (three.js). Add `?hour=13` to the page address to preview it at a given time of day.
- How it thinks: `src/brain.js`

## Cost

On a subscription token, Glorp uses your plan's normal usage limits (about 32 short requests a day, capped by `MAX_TICKS_PER_DAY`). On an API key, each tick is one Claude request at low effort, roughly 2 to 4 cents on Claude Opus 5.5. With the defaults (every 30 minutes, asleep 11am to 7pm) that is about 32 ticks a day, capped at $1 a day by `DAILY_BUDGET_USD`.
