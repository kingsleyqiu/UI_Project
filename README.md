# Pizza Ordering Assistant

SOFE4850 UX Final Project, Fall 2026 - Group 10.

Team: Aryan Kumar, Qian Qiu, and Mohit Gajula.

## Project scope

The group proposal describes a desktop website prototype with a visible 2D avatar that guides users through a pizza order using typed text or voice. Payment and order confirmation are simulated.

Planned features:

- Pickup or delivery, pizza size, crust, toppings, quantity, and payment-method selection; an address is requested for delivery only.
- One pizza configuration per order, with a quantity choice.
- A visible order summary, changes to individual selections, and explicit confirmation before completing the order.
- Speech recognition, spoken replies with matching visible text, and clear listening, processing, speaking, and waiting states.
- Recovery from unsupported toppings, incomplete delivery addresses, and speech-recognition errors while retaining the current order.

Status: repository initialized; the prototype has not been implemented here yet.

## Team workflow

- `main`: shared integration branch and default branch.
- `kingsley`: Qian Qiu's personal working branch.
- Other teammates create and use their own branches from the latest `main`.

1. Make changes and commit on your own branch.
2. Push your branch to GitHub.
3. Open a Pull Request from your branch into `main`; review the changes before merging.
4. After a merge, fetch the latest `main` and merge it into your own branch before continuing.

Do not commit directly to `main` during team development. This is the team's workflow convention; branch names alone do not enforce it.

For Kingsley's local checkout:

```sh
git switch kingsley
git fetch origin
git merge origin/main
# Make changes, then stage only the intended files.
git add README.md
git commit -m "Describe the change"
git push origin kingsley
```

Replace `README.md` with the files you actually changed. On GitHub, open a Pull Request with base `main` and compare `kingsley`.

## Course deliverables

The supplied guideline calls for a proposal, at least one persona, a user journey/task flow, a conversation flow, wireframes, a high-fidelity or working prototype, a voice interaction demo, usability testing with at least three users, a final UX report, and a 5-10 minute presentation/demo.

The prototype must demonstrate a complete successful task and at least two error/recovery situations. Required conversation checks cover normal completion, missing information, invalid answers, corrections, voice-recognition problems, and final confirmation.

The guideline lists presentations on November 30 and December 4, 2026, and a final report deadline of December 4, 2026 at 11:59 pm, with a five-page report limit. The Canvas ZIP must contain documented source files and the final report. Check Canvas for the team's presentation slot and any later course updates.

This summary records the supplied proposal and guideline; planned features and deliverables are not claims of completed work.
