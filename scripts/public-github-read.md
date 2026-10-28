# Explicit public checkpoint reads

Use `node scripts/fetch-hosted-checkpoint.mjs <run-id> --public` from the
exact candidate checkout. This opts into anonymous HTTPS for the public
`vtjeng/teleport-contest` repository. Default Checks reads and `--artifact`
continue using the existing authenticated gh path. Flags cannot be combined.
An authentication/permission failure never triggers a fallback between modes.
The earlier reported GH_TOKEN/401 failure is not repaired or retried implicitly.

The read-only helper permits only workflow-run metadata, jobs for an exact run
attempt, the combine check, and its annotations. It accepts no arbitrary host,
repository, endpoint, write method, artifact URL, credential or query. Its Node
subprocess gets an empty environment, and requests send only Accept, User-Agent,
and API-version headers. No token, cookie, Authorization header or gh config is
used. Redirects fail. A request/body has a 30-second deadline (35-second process
watchdog) and a 16-MiB page cap. HTTP failures, malformed responses and anonymous
rate limits stop immediately with no retry; rate reset/retry-after numbers are
reported when supplied. Anonymous GitHub quota is lower than authenticated quota.

The existing reader requests numbered pages of 100 items, up to its 1000-page
limit. Declared job/annotation totals must agree where provided. Exact run/SHA,
repository visibility, workflow/attempt, combine job/check/app/suite identity,
chunk membership/counts, compressed and file hashes, archive membership,
synthetic comparisons, clean candidate checks, and post-read run revalidation
are retained. Decoding verifies the complete payload before materialization.

GitHub documents unauthenticated public access for these endpoints:
- https://docs.github.com/en/rest/checks/runs#list-check-run-annotations
- https://docs.github.com/en/rest/checks/runs#get-a-check-run
- https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
- https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt

Live verification remains pending parent review. Proposed request:
`GET https://api.github.com/repos/vtjeng/teleport-contest/check-runs/122647227685/annotations?per_page=100&page=1`
with headers `Accept: application/vnd.github+json`,
`X-GitHub-Api-Version: 2022-11-28`, and
`User-Agent: teleport-public-checkpoint-importer`; no Authorization.

A complete verification would first read workflow run `40636359660`, bind its
returned attempt/jobs to check `122647227685` and candidate
`7a21d1777043b6a9a5294c95cabff5b9defcc94a`, then read numbered annotation pages
and re-read run metadata. It must run from that candidate with this reviewed
importer available under the existing integration procedure. Do not substitute
this tooling branch's HEAD for the gameplay candidate or relax the exact-SHA gate.
