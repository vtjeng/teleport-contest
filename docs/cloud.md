# Cloud jobs

One row per Google Cloud VM job run for this project, appended by
`.cache/lead/cloud/replay.sh` when the job's VM is deleted. The VMs run in the
`vtjeng-teleport` project as the `teleport-replay` service account, carry the
label `purpose=teleport-replay`, and keep their data in
`gs://vtjeng-teleport-replays`. The project is separate from
`pluribus-impl-5`'s `hunl-training`, so that project's stray and budget checks
never see these VMs. Prices come from `pluribus-impl-5`'s tables, as
does the speed estimate for any machine family other than C3D.

- **Hours** is the VM's elapsed time, from creation to deletion.
- **Est. $** is the hours times the spot rate that `pluribus-impl-5`'s
  `scripts/cloud/place.py --rate` gave for the machine and zone at launch. It
  is an estimate until the bill posts.
- **Use** is the mean 1-minute load as a share of the vCPUs, and the peak
  memory in use, sampled every two minutes. Load below 70% of the vCPUs or
  peak memory under a quarter of the machine's suggests that the next job of
  that kind could run more workers or use a smaller or leaner machine. Keep a
  cool machine when contention would cost more: a recording job whose C
  recorder starts timing out (C-side failures) or slowing runs at that load.
- Times are Pacific.

| Start | Job | Machine | Zone | Hours | Est. $ | Status | Use | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 03:16 PST | b5-bbc273b6 | c3d-highcpu-60 | us-east1-c | under 0.04 | under 0.02 | stopped by hand | not sampled | replay batch 5 at bbc273b6, 40 workers, 0 of 3000 games. Row written by hand at 03:21 PST: I stopped the launcher within about a minute of this VM’s creation, and the stop cut the clean-up short after the delete. The VM was gone at 03:17:31 PST; the bound counts from the launch at 03:15 PST. Fixed in the launcher the same hour. |
| 2026-11-06 10:16 PST | b6-rectest | c3d-highcpu-60 | us-central1-a | 0.056 | 0.029 | exit 0 | load 37.7 of 60 mean, peak 11.2 GB | record batch 6 at 6fb0bbc9, 40 workers, 100 of 100 games |
| 2026-11-06 09:54 PST | b5-bbc273b6-c2d | c2d-highcpu-56 | us-east4-a | 0.556 | 0.459 | exit 0 | load 53.1 of 56 mean, peak 13.7 GB | replay batch 5 at bbc273b6, 36 workers, 3000 of 3000 games |
| 2026-11-06 10:22 PST | b6-rectest2 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 34.1 of 60 mean, peak 8.5 GB | record batch 6 at 6fb0bbc9, 40 workers, 100 of 100 games |
| 2026-11-06 10:30 PST | b6-rest | c3d-highcpu-60 | us-central1-a | 0.351 | 0.181 | exit 0 | load 55.3 of 60 mean, peak 11.3 GB | record batch 6 at 6fb0bbc9, 40 workers, 1607 of 1607 games |
