# Generated legislator pages

One static page per current member of Congress, at `{bioguide}.html`.

These are **generated**, not hand-edited. Source of truth is the generator at
`../../app/worker/generate-rep-pages.mjs` + the `unitedstates/congress-legislators`
dataset. To (re)build all 535:

```bash
cd ../../app && npm run generate:rep-pages
```

The files currently here (Sanders, AOC, Cruz) are samples committed so the design
is viewable without running the generator. Re-running overwrites/fills the full set.
