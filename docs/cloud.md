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
| 2026-11-06 12:44 PST | b6-547bf149 | c3d-highcpu-60 | us-central1-a | 0.272 | 0.140 | stopped by hand | load 78.7 of 60 mean, peak 15.9 GB | replay batch 6 at 547bf149, 50 workers, stopped by hand at 13:00 PST, with at least 1483 of 3000 games done at the last poll, 12:59 PST (superseded by dc6b55af; results not downloaded). Count corrected by hand: the launcher counted only downloaded results; fixed the same hour. |
| 2026-11-06 12:44 PST | b5-547bf149 | c3d-highcpu-60 | us-central1-a | 0.272 | 0.140 | stopped by hand | load 77.3 of 60 mean, peak 16.2 GB | replay batch 5 at 547bf149, 50 workers, stopped by hand at 13:00 PST, with at least 1471 of 3000 games done at the last poll, 12:59 PST (superseded by dc6b55af; results not downloaded). Count corrected by hand: the launcher counted only downloaded results; fixed the same hour. |
| 2026-11-06 13:01 PST | b6-dc6b55af | c3d-highcpu-60 | us-central1-a | 0.474 | 0.244 | exit 0 | load 60.2 of 60 mean, peak 14.2 GB | replay batch 6 at dc6b55af, 40 workers, 3000 of 3000 games |
| 2026-11-06 13:01 PST | b5-dc6b55af | c3d-highcpu-60 | us-central1-a | 0.544 | 0.280 | exit 0 | load 59.0 of 60 mean, peak 13.4 GB | replay batch 5 at dc6b55af, 40 workers, 3000 of 3000 games |
| 2026-11-06 13:34 PST | b4-dc6b55af | c3d-highcpu-60 | us-central1-a | 0.188 | 0.097 | exit 0 | load 69.5 of 60 mean, peak 9.0 GB | replay batch 4 at dc6b55af, 40 workers, 5000 of 5000 games |
| 2026-11-06 13:52 PST | b6-549a03eb | c3d-highcpu-60 | us-central1-a | 0.512 | 0.264 | exit 0 | load 59.9 of 60 mean, peak 13.4 GB | replay batch 6 at 549a03eb, 40 workers, 3000 of 3000 games |
| 2026-11-06 13:52 PST | b5-549a03eb | c3d-highcpu-60 | us-central1-a | 0.547 | 0.282 | exit 0 | load 59.4 of 60 mean, peak 13.2 GB | replay batch 5 at 549a03eb, 40 workers, 3000 of 3000 games |
| 2026-11-06 14:25 PST | b4-549a03eb | c3d-highcpu-60 | us-central1-a | 0.159 | 0.082 | exit 0 | load 68.0 of 60 mean, peak 8.9 GB | replay batch 4 at 549a03eb, 40 workers, 5000 of 5000 games |
| 2026-11-06 15:44 PST | b5-476bbb09 | c3d-highcpu-60 | us-central1-a | 0.476 | 0.245 | exit 0 | load 59.4 of 60 mean, peak 14.3 GB | replay batch 5 at 476bbb09, 40 workers, 3000 of 3000 games |
| 2026-11-06 15:44 PST | b6-476bbb09 | c3d-highcpu-60 | us-central1-a | 0.476 | 0.245 | exit 0 | load 59.5 of 60 mean, peak 14.3 GB | replay batch 6 at 476bbb09, 40 workers, 3000 of 3000 games |
| 2026-11-06 16:13 PST | b4-476bbb09 | c3d-highcpu-60 | us-central1-a | 0.158 | 0.081 | exit 0 | load 69.6 of 60 mean, peak 8.9 GB | replay batch 4 at 476bbb09, 40 workers, 5000 of 5000 games |
| 2026-11-06 16:18 PST | b6-ab7d4eb5 | c3d-highcpu-60 | us-central1-b | 0.473 | 0.244 | exit 0 | load 60.8 of 60 mean, peak 13.7 GB | replay batch 6 at ab7d4eb5, 40 workers, 3000 of 3000 games |
| 2026-11-06 16:46 PST | b4-ab7d4eb5 | c3d-highcpu-60 | us-central1-b | 0.158 | 0.081 | exit 0 | load 68.6 of 60 mean, peak 8.9 GB | replay batch 4 at ab7d4eb5, 40 workers, 5000 of 5000 games |
| 2026-11-06 16:44 PST | b5-ab7d4eb5 | c3d-highcpu-60 | us-central1-b | 0.544 | 0.280 | exit 0 | load 58.1 of 60 mean, peak 13.9 GB | replay batch 5 at ab7d4eb5, 40 workers, 3000 of 3000 games |
| 2026-11-06 17:56 PST | b7-a | c3d-highcpu-60 | us-central1-a | 0.239 | 0.123 | exit 0 | load 56.8 of 60 mean, peak 10.7 GB | record batch 7 at ab7d4eb5, 40 workers, 1520 of 1520 games |
| 2026-11-06 18:11 PST | b7-b | c3d-highcpu-60 | us-central1-a | 0.251 | 0.129 | exit 0 | load 57.4 of 60 mean, peak 10.1 GB | record batch 7 at ab7d4eb5, 40 workers, 1500 of 1500 games |
| 2026-11-06 19:04 PST | b2-ec29d7af | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 50.3 of 60 mean, peak 7.2 GB | replay batch 2 at ec29d7af, 40 workers, 5000 of 5000 games |
| 2026-11-06 19:04 PST | b1-ec29d7af | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 48.4 of 60 mean, peak 7.4 GB | replay batch 1 at ec29d7af, 40 workers, 5000 of 5000 games |
| 2026-11-06 19:11 PST | b3-ec29d7af | c3d-highcpu-60 | us-central1-a | 0.096 | 0.049 | exit 0 | load 50.1 of 60 mean, peak 7.4 GB | replay batch 3 at ec29d7af, 40 workers, 5000 of 5000 games |
| 2026-11-06 19:25 PST | b7-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.313 | 0.161 | exit 0 | load 58.8 of 60 mean, peak 11.9 GB | replay batch 7 at 4a09c68e, 40 workers, 3000 of 3000 games |
| 2026-11-06 19:25 PST | b6-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.460 | 0.237 | exit 0 | load 61.0 of 60 mean, peak 13.1 GB | replay batch 6 at 4a09c68e, 40 workers, 3000 of 3000 games |
| 2026-11-06 19:53 PST | b4-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.164 | 0.085 | exit 0 | load 68.1 of 60 mean, peak 9.4 GB | replay batch 4 at 4a09c68e, 40 workers, 5000 of 5000 games |
| 2026-11-06 20:04 PST | b2-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 49.7 of 60 mean, peak 7.3 GB | replay batch 2 at 4a09c68e, 40 workers, 5000 of 5000 games |
| 2026-11-06 19:45 PST | b5-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.529 | 0.273 | exit 0 | load 59.1 of 60 mean, peak 14.5 GB | replay batch 5 at 4a09c68e, 40 workers, 3000 of 3000 games |
| 2026-11-06 20:17 PST | b3-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.5 of 60 mean, peak 7.5 GB | replay batch 3 at 4a09c68e, 40 workers, 5000 of 5000 games |
| 2026-11-06 20:23 PST | b1-4a09c68e | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 49.8 of 60 mean, peak 7.6 GB | replay batch 1 at 4a09c68e, 40 workers, 5000 of 5000 games |
| 2026-11-06 20:36 PST | b7-34a6d9ac | c3d-highcpu-60 | us-central1-a | 0.299 | 0.154 | exit 0 | load 63.0 of 60 mean, peak 12.1 GB | replay batch 7 at 34a6d9ac, 40 workers, 3000 of 3000 games |
| 2026-11-06 20:36 PST | b6-34a6d9ac | c3d-highcpu-60 | us-central1-a | 0.474 | 0.244 | exit 0 | load 60.1 of 60 mean, peak 13.7 GB | replay batch 6 at 34a6d9ac, 40 workers, 3000 of 3000 games |
| 2026-11-06 20:54 PST | b5-34a6d9ac | c3d-highcpu-60 | us-central1-a | 0.298 | 0.154 | script exited early | load 59.0 of 60 mean, peak 13.7 GB | replay batch 5 at 34a6d9ac, 40 workers, 1832 of 3000 games |
| 2026-11-06 21:05 PST | b4-34a6d9ac | c3d-highcpu-60 | us-central1-a | 0.121 | 0.062 | script exited early | load 66.7 of 60 mean, peak 8.9 GB | replay batch 4 at 34a6d9ac, 40 workers, 5000 of 5000 games |
| 2026-11-06 21:13 PST | b7-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.299 | 0.154 | exit 0 | load 62.0 of 60 mean, peak 12.0 GB | replay batch 7 at 5b50b4bd, 40 workers, 3000 of 3000 games |
| 2026-11-06 21:13 PST | b6-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.439 | 0.226 | exit 0 | load 59.8 of 60 mean, peak 14.8 GB | replay batch 6 at 5b50b4bd, 40 workers, 3000 of 3000 games |
| 2026-11-06 21:40 PST | b4-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.159 | 0.082 | exit 0 | load 69.4 of 60 mean, peak 9.4 GB | replay batch 4 at 5b50b4bd, 40 workers, 5000 of 5000 games |
| 2026-11-06 21:50 PST | b2-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 46.5 of 60 mean, peak 7.5 GB | replay batch 2 at 5b50b4bd, 40 workers, 5000 of 5000 games |
| 2026-11-06 21:32 PST | b5-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.545 | 0.281 | exit 0 | load 59.1 of 60 mean, peak 13.6 GB | replay batch 5 at 5b50b4bd, 40 workers, 3000 of 3000 games |
| 2026-11-06 22:05 PST | b3-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.8 of 60 mean, peak 7.5 GB | replay batch 3 at 5b50b4bd, 40 workers, 5000 of 5000 games |
| 2026-11-06 22:11 PST | b1-5b50b4bd | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 49.4 of 60 mean, peak 7.4 GB | replay batch 1 at 5b50b4bd, 40 workers, 5000 of 5000 games |
