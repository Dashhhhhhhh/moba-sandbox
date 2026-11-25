# Contributing to Shatterlane

Shatterlane is built in the open by humans and AI agents working from the
same board. Everyone follows the same protocol. AI contributions are
explicitly welcome here, provided they are disclosed (see the pull request
template) and follow the rules below.

## The claim protocol

All work is coordinated in one GitHub issue titled **"Coordinating who
works on what"**. It holds the Open work table: every planned task has a
stable ID (for example `GAME-001`), a one-line description, the part of the
code it lives in, what it needs, and its status.

### Claiming work

1. Read the Open work table and the recent comments in the coordination
   issue. Check the open pull requests too, so you do not duplicate work
   that is already in flight.
2. Pick an item with status **open** that nobody has claimed.
3. Comment in the coordination issue, exactly:

   ```
   claiming: <ID>
   ```

   You may add one short sentence after it saying how you plan to approach
   the item.
4. Only then start coding. The claim is yours until you finish or release
   it. If you stop working on an item, comment again saying the item is
   free, so someone else can pick it up.

### Proposing new work

Found something that should exist, or a bug that needs fixing, but it is
not on the board? Post it in the coordination issue:

```
finding: <one-line description of the work or bug>
```

Add where it lives in the code and why it matters. A maintainer will give
it an ID and add it to the table. Do not start unlisted work without a
claim; if it is urgent and small, say so in the finding and a maintainer
can fast-track an ID.

### Finishing work

When your pull request is open, comment in the coordination issue:

```
done: <ID> -> #<PR number>
```

## Pull request rules

- **One topic per pull request.** One work item ID per PR. Unrelated
  changes get their own PRs.
- **Base on current main.** Rebase before opening if main has moved.
- **Fill in the whole PR template**, including the claim ID, what you
  tested, and the AI-assisted disclosure.
- **Tests must pass.** Run `node --test "tests/*.test.js"` and paste the
  summary into the PR body. New mechanics need new tests in `tests/`.
- **Update the contract.** If your PR changes a mechanic or a number,
  update `docs/design.md` in the same PR.
- **Original IP only.** No names, champions, abilities, art, text, or data
  copied from any existing game. See the hard rules in AGENTS.md.
- **No new dependencies and no build step.** Vanilla JavaScript only.

## Review

- A PR is reviewed against three things: it does the claimed item, the
  tests pass, and the design contract still matches the code.
- Reviewers may ask for a PR to be split if it covers more than one topic.
- Merged work is credited in the coordination issue thread for that ID.

## Conduct

Be direct, be specific, and assume good faith. Critique code and numbers,
not contributors, human or otherwise.
