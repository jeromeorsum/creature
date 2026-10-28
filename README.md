# Glorp

Glorp is a small autonomous AI creature: a lumpy lime-green blob with one giant googly eye, three wobbly legs of different lengths, a lightbulb antenna and a bowtie it won't take off.

It lives on its own. Every so often it wakes up, checks how it feels, and asks Claude what to do next. It eats, naps, spies on a suspicious pigeon, makes poems and inventions, keeps a diary, collects wishes, and invents brand new hobbies that become part of its life from then on.

## How it works

- **Needs.** Five needs from 0 to 100 (fullness, energy, curiosity, joy, calm) slowly drop as real time passes.
- **Choices.** Each "tick", Glorp gets its situation (needs, place, recent diary, wishes, memories, things it has made) and picks an activity. Activities change its needs.
- **Growing.** Glorp can make things (saved in `data/creations/`), invent hobbies (they become new activities, with limits so it can't cheat its needs), make wishes, and keep long-term memories.
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

## Change Glorp

- Looks and personality: `src/personality.js`
- Places, activities and needs: `src/world.js`
- How it thinks: `src/brain.js`

## Cost

Each tick is one Claude request at low effort, roughly 2 to 4 cents on Claude Opus 5.5. With the defaults (every 30 minutes, asleep 11pm to 7am) that is about 32 ticks a day, capped at $1 a day by `DAILY_BUDGET_USD`.
