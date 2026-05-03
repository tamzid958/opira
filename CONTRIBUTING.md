# Contributing

Thanks for considering a contribution. Whether you're filing a bug, suggesting a feature, fixing a typo, or shipping a major change, every patch is appreciated.

## Ground rules

- Be kind. Everyone interacting in the project's spaces is expected to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
- Keep discussion on topic. The issue tracker is for *this* repository — questions about OpenProject itself belong on the [OpenProject community forum](https://community.openproject.org/).
- Security-sensitive findings go through [SECURITY.md](./SECURITY.md) rather than public issues.

## Setting up your dev environment

You will need an OpenProject server to develop against. The Community edition runs on a single Docker command:

```bash
docker run -d -p 8080:80 --name openproject openproject/openproject:14
```

Then in this repo:

```bash
git clone https://github.com/<your-fork>/openproject-jira-theme.git opira
cd opira
npm install
cp .env.local.example .env.local
# fill in OPENPROJECT_URL, OAuth client id/secret, AUTH_SECRET
npm run dev
```

OAuth application registration is documented in the [README](./README.md#registering-the-oauth-client-in-openproject).

## Before you open a PR

1. Fork the repository.
2. Branch from `master`. Name the branch after the change: `feat/board-swimlanes`, `fix/sprint-points-rollup`, `docs/screenshots`.
3. Keep the diff focused — one PR, one concern.
4. Run `npm run build` and `npm run lint` locally and make sure both pass.
5. Open a PR and fill the template. Link any related issue.

A pull request will be merged once it builds cleanly, lints cleanly, has at least one approving review, and exercises any user-facing change in a short screen recording or screenshot attached to the PR.

## Reporting bugs

Use the **Bug report** issue template. The two most useful things to include:

1. A small reproducible scenario — even four numbered steps usually nails it.
2. The OpenProject version (`Administration → Information`) and your browser.

If the bug doesn't reproduce in stock OpenProject, that's worth saying so we can triage between *upstream* and *this UI*.

## Proposing features

Use the **Feature request** template. Lead with the user problem, not the implementation. A feature is most likely to land if reviewers can picture the workflow it unlocks.

For larger ideas, sketching in a discussion first is often faster than starting with code — we can sanity-check the API surface together before you invest hours.

## Coding conventions

- **JavaScript with JSDoc, not TypeScript** — match the surrounding style.
- **App Router only.** Every new page lives under `app/`.
- **Page state in URL params.** Sharable links and sane back/forward behaviour come for free; reach for `useSearchParams` and the `useUrlParams` helper before adding `useState` for things a teammate might want to send by Slack.
- **Reads through TanStack Query.** Mutations should `cancelQueries` in `onMutate` before writing optimistic state, then merge the server response in `onSuccess`.
- **Forms use `react-hook-form` + `zod`** — even single-field forms benefit from a validator.
- **Tailwind utility classes.** If you find yourself writing `style={{ ... }}` to express a token, prefer adding the token to `app/globals.css` and reaching for it via a class.
- **Comments explain *why*, not *what*.** The reader can see what the code does; spell out the constraint or trap that motivated the shape.
- **No emojis in source files.** Iconography is welcome; emojis aren't.

A handful of helpers exist to keep things consistent — please reach for them rather than re-rolling:

| Helper | What it does |
| --- | --- |
| [`useUrlParams`](./lib/hooks/use-modal-url.js) | Patch URL search params without leaving the path. |
| [`pickSprintByDate` / `useActiveSprint`](./lib/hooks/use-active-sprint.js) | Pick a default sprint by today's date. |
| [`resolveApiPatch`](./lib/openproject/resolve-patch.js) | Translate friendly bucket names into OpenProject ids. |
| [`runBatched`](./lib/openproject/resolve-patch.js) | Concurrent batches for bulk work-package mutations. |
| [Avatar / EmptyState / LoadingPill / Menu / TagPill / StatusPill](./components/ui/) | Reuse before recreating. |

## Commit messages

Light Conventional Commits. Prefix the subject with one of `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `test`, `build`. Keep the subject under 72 characters.

```
feat(backlog): import work packages from JSON

Walks the tree depth-first, threads parent ids into children,
validates the file with zod.
```

## Testing

The project doesn't yet ship a unit-test suite — manual verification against a local OpenProject is the bar today. If you add a feature that lends itself to unit testing (a pure helper, a mapper edge case), feel free to introduce a `*.test.js` next to the file. We'll wire up `vitest` once a critical mass of tests exists.

For UI changes, please attach a short screen recording or a before/after screenshot to the PR. It dramatically shortens review.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
