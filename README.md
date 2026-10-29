# Glorp

Glorp is a small autonomous AI creature: a round lime-green toucan-ish bird that is mostly beak, with one giant googly eye, three wobbly legs of different lengths, tiny useless wings and a bowtie it won't take off.

It lives on its own island. Every so often it wakes up, checks how it feels, and asks Claude what to do next. It scavenges wood, stone, shells and scrap, picks berries to stock its kitchen, designs and builds things block by block, worries about problems (an empty cupboard, a thieving pigeon, wind knocking its tower over) and makes plans to fix them. It also makes poems and inventions, keeps a diary, collects wishes, and invents brand new hobbies.

The web page is a fullscreen 3D island you can walk around (WASD and mouse, or touch) to find Glorp and see everything it has built.

## How it works

- **Needs.** Five needs from 0 to 100 (fullness, energy, curiosity, joy, calm) slowly drop as real time passes.
- **Choices.** Each "tick", Glorp gets its situation (needs, place, recent diary, wishes, memories, things it has made) and picks an activity. Activities change its needs.
- **Growing.** Glorp can make things (saved in `data/creations/`), invent hobbies (they become new activities, with limits so it can't cheat its needs), make wishes, and keep long-term memories.
- **Island.** Resources live on trees, rocks, bushes, shells and junk around the island. They run out when collected and grow back slowly. Small events happen on their own (weather, the pigeon stealing, gusts knocking blocks off buildings).
- **Building.** Glorp designs projects as up to 24 blocks (box, cylinder, cone, sphere) made of wood, stone, shells or scrap. Each `build` turn places up to 5 blocks if it has the materials. Buildings stay in the world for good.
- **Worries and plans.** Glorp sees a list of problems worked out from its world, and keeps its own worries and a current plan.
- **Sleeping.** At night it sleeps and makes no AI calls.
- **Spending cap.** It stops thinking for the day once it hits `DAILY_BUDGET_USD`.

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

On a subscription token, Glorp uses your plan's normal usage limits (about 32 short requests a day, capped by `MAX_TICKS_PER_DAY`). On an API key, each tick is one Claude request at low effort, roughly 2 to 4 cents on Claude Opus 5.5. With the defaults (every 30 minutes, asleep 11pm to 7am) that is about 32 ticks a day, capped at $1 a day by `DAILY_BUDGET_USD`.
