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
| 2026-11-07 00:41 PST | b4-9c6d73a01 | c3d-highcpu-60 | us-west1-c | 0.160 | 0.082 | exit 0 | load 68.4 of 60 mean, peak 9.0 GB | replay batch 4 at 9c6d73a0, 40 workers, 5000 of 5000 games |
| 2026-11-07 00:39 PST | b7-9c6d73a01 | c3d-highcpu-60 | us-central1-a | 0.308 | 0.159 | exit 0 | load 61.3 of 60 mean, peak 11.9 GB | replay batch 7 at 9c6d73a0, 40 workers, 3000 of 3000 games |
| 2026-11-07 00:39 PST | b6-9c6d73a01 | c3d-highcpu-60 | us-central1-a | 0.451 | 0.232 | exit 0 | load 59.6 of 60 mean, peak 14.1 GB | replay batch 6 at 9c6d73a0, 40 workers, 3000 of 3000 games |
| 2026-11-07 00:41 PST | b5-9c6d73a01 | c3d-highcpu-60 | us-west1-c | 0.582 | 0.300 | exit 0 | load 59.0 of 60 mean, peak 13.6 GB | replay batch 5 at 9c6d73a0, 40 workers, 3000 of 3000 games |
| 2026-11-07 01:16 PST | b3-9c6d73a01 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 50.9 of 60 mean, peak 7.7 GB | replay batch 3 at 9c6d73a0, 40 workers, 5000 of 5000 games |
| 2026-11-07 01:16 PST | b2-9c6d73a01 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 49.6 of 60 mean, peak 7.7 GB | replay batch 2 at 9c6d73a0, 40 workers, 5000 of 5000 games |
| 2026-11-07 01:17 PST | b1-9c6d73a01 | c3d-highcpu-60 | us-east1-c | 0.094 | 0.048 | exit 0 | load 50.6 of 60 mean, peak 7.5 GB | replay batch 1 at 9c6d73a0, 40 workers, 5000 of 5000 games |
| 2026-11-07 01:33 PST | b4-5664398 | c3d-highcpu-60 | us-west1-c | 0.159 | 0.082 | exit 0 | load 68.0 of 60 mean, peak 9.3 GB | replay batch 4 at 56643983, 40 workers, 5000 of 5000 games |
| 2026-11-07 01:32 PST | b7-5664398 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 62.7 of 60 mean, peak 12.0 GB | replay batch 7 at 56643983, 40 workers, 3000 of 3000 games |
| 2026-11-07 01:33 PST | b6-5664398 | c3d-highcpu-60 | us-east1-c | 0.476 | 0.245 | exit 0 | load 60.0 of 60 mean, peak 14.4 GB | replay batch 6 at 56643983, 40 workers, 3000 of 3000 games |
| 2026-11-07 01:32 PST | b5-5664398 | c3d-highcpu-60 | us-central1-a | 0.545 | 0.281 | exit 0 | load 58.1 of 60 mean, peak 15.3 GB | replay batch 5 at 56643983, 40 workers, 3000 of 3000 games |
| 2026-11-07 02:05 PST | b3-5664398 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.046 | exit 0 | load 49.5 of 60 mean, peak 7.5 GB | replay batch 3 at 56643983, 40 workers, 5000 of 5000 games |
| 2026-11-07 02:05 PST | b1-5664398 | c3d-highcpu-60 | us-central1-b | 0.090 | 0.046 | exit 0 | load 48.7 of 60 mean, peak 7.7 GB | replay batch 1 at 56643983, 40 workers, 5000 of 5000 games |
| 2026-11-07 02:05 PST | b2-5664398 | c3d-highcpu-60 | us-east1-b | 0.090 | 0.046 | exit 0 | load 50.8 of 60 mean, peak 7.3 GB | replay batch 2 at 56643983, 40 workers, 5000 of 5000 games |
| 2026-11-07 09:15 PST | hp-b4 | c3d-highcpu-60 | us-west1-c | 0.166 | 0.086 | exit 0 | load 69.5 of 60 mean, peak 8.8 GB | replay batch 4 at ae2ee426, 40 workers, 5000 of 5000 games |
| 2026-11-07 09:13 PST | hp-b7 | c3d-highcpu-60 | us-central1-a | 0.349 | 0.180 | exit 0 | load 62.2 of 60 mean, peak 11.8 GB | replay batch 7 at ae2ee426, 40 workers, 3000 of 3000 games |
| 2026-11-07 09:14 PST | hp-b6 | c3d-highcpu-60 | us-east1-b | 0.492 | 0.254 | exit 0 | load 60.0 of 60 mean, peak 13.5 GB | replay batch 6 at ae2ee426, 40 workers, 3000 of 3000 games |
| 2026-11-07 09:13 PST | hp-b5 | c3d-highcpu-60 | us-central1-a | 0.528 | 0.272 | exit 0 | load 58.7 of 60 mean, peak 13.9 GB | replay batch 5 at ae2ee426, 40 workers, 3000 of 3000 games |
| 2026-11-07 09:45 PST | hp-b2 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 52.6 of 60 mean, peak 7.6 GB | replay batch 2 at ae2ee426, 40 workers, 5000 of 5000 games |
| 2026-11-07 09:46 PST | hp-b1 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 50.8 of 60 mean, peak 7.4 GB | replay batch 1 at ae2ee426, 40 workers, 5000 of 5000 games |
| 2026-11-07 09:46 PST | hp-b3 | c3d-highcpu-60 | us-east1-b | 0.091 | 0.047 | exit 0 | load 47.6 of 60 mean, peak 7.6 GB | replay batch 3 at ae2ee426, 40 workers, 5000 of 5000 games |
| 2026-11-07 10:07 PST | us-b4 | c3d-highcpu-60 | us-central1-a | 0.159 | 0.082 | exit 0 | load 68.9 of 60 mean, peak 8.8 GB | replay batch 4 at b47a1b5b, 40 workers, 5000 of 5000 games |
| 2026-11-07 10:09 PST | us-b7 | c3d-highcpu-60 | us-west1-c | 0.299 | 0.154 | exit 0 | load 63.0 of 60 mean, peak 12.2 GB | replay batch 7 at b47a1b5b, 40 workers, 3000 of 3000 games |
| 2026-11-07 10:07 PST | us-b6 | c3d-highcpu-60 | us-central1-a | 0.511 | 0.263 | exit 0 | load 59.9 of 60 mean, peak 13.6 GB | replay batch 6 at b47a1b5b, 40 workers, 3000 of 3000 games |
| 2026-11-07 10:08 PST | us-b5 | c3d-highcpu-60 | us-east1-b | 0.546 | 0.281 | exit 0 | load 57.3 of 60 mean, peak 14.0 GB | replay batch 5 at b47a1b5b, 40 workers, 3000 of 3000 games |
| 2026-11-07 10:41 PST | us-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.4 of 60 mean, peak 7.5 GB | replay batch 2 at b47a1b5b, 40 workers, 5000 of 5000 games |
| 2026-11-07 10:41 PST | us-b1 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 48.7 of 60 mean, peak 7.8 GB | replay batch 1 at b47a1b5b, 40 workers, 5000 of 5000 games |
| 2026-11-07 10:42 PST | us-b3 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.045 | exit 0 | load 49.3 of 60 mean, peak 7.6 GB | replay batch 3 at b47a1b5b, 40 workers, 5000 of 5000 games |
| 2026-11-07 10:49 PST | pl-b4 | c3d-highcpu-60 | us-east1-c | 0.159 | 0.082 | exit 0 | load 71.1 of 60 mean, peak 9.1 GB | replay batch 4 at 27bd5eeb, 40 workers, 5000 of 5000 games |
| 2026-11-07 10:48 PST | pl-b7 | c3d-highcpu-60 | us-central1-a | 0.333 | 0.172 | exit 0 | load 62.8 of 60 mean, peak 11.7 GB | replay batch 7 at 27bd5eeb, 40 workers, 3000 of 3000 games |
| 2026-11-07 10:49 PST | pl-b6 | c3d-highcpu-60 | us-west1-c | 0.473 | 0.244 | exit 0 | load 60.2 of 60 mean, peak 14.0 GB | replay batch 6 at 27bd5eeb, 40 workers, 3000 of 3000 games |
| 2026-11-07 10:48 PST | pl-b5 | c3d-highcpu-60 | us-central1-a | 0.508 | 0.262 | exit 0 | load 57.7 of 60 mean, peak 13.2 GB | replay batch 5 at 27bd5eeb, 40 workers, 3000 of 3000 games |
| 2026-11-07 11:19 PST | pl-b3 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 48.7 of 60 mean, peak 7.5 GB | replay batch 3 at 27bd5eeb, 40 workers, 5000 of 5000 games |
| 2026-11-07 11:19 PST | pl-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.0 of 60 mean, peak 7.4 GB | replay batch 1 at 27bd5eeb, 40 workers, 5000 of 5000 games |
| 2026-11-07 11:20 PST | pl-b2 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.045 | exit 0 | load 48.7 of 60 mean, peak 7.3 GB | replay batch 2 at 27bd5eeb, 40 workers, 5000 of 5000 games |
| 2026-11-07 11:28 PST | pl2-b4 | c3d-highcpu-60 | us-east1-c | 0.160 | 0.082 | exit 0 | load 68.4 of 60 mean, peak 8.6 GB | replay batch 4 at 69405796, 40 workers, 5000 of 5000 games |
| 2026-11-07 11:28 PST | pl2-b7 | c3d-highcpu-60 | us-central1-a | 0.333 | 0.172 | exit 0 | load 62.2 of 60 mean, peak 11.6 GB | replay batch 7 at 69405796, 40 workers, 3000 of 3000 games |
| 2026-11-07 11:28 PST | pl2-b6 | c3d-highcpu-60 | us-central1-a | 0.474 | 0.244 | exit 0 | load 59.6 of 60 mean, peak 13.9 GB | replay batch 6 at 69405796, 40 workers, 3000 of 3000 games |
| 2026-11-07 11:29 PST | pl2-b5 | c3d-highcpu-60 | us-west1-c | 0.542 | 0.279 | exit 0 | load 58.1 of 60 mean, peak 13.8 GB | replay batch 5 at 69405796, 40 workers, 3000 of 3000 games |
| 2026-11-07 12:02 PST | pl2-b3 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 52.6 of 60 mean, peak 6.9 GB | replay batch 3 at 69405796, 40 workers, 5000 of 5000 games |
| 2026-11-07 12:02 PST | pl2-b1 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 50.5 of 60 mean, peak 7.3 GB | replay batch 1 at 69405796, 40 workers, 5000 of 5000 games |
| 2026-11-07 12:03 PST | pl2-b2 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.045 | exit 0 | load 52.2 of 60 mean, peak 7.2 GB | replay batch 2 at 69405796, 40 workers, 5000 of 5000 games |
| 2026-11-07 13:18 PST | yf-b4 | c3d-highcpu-60 | us-central1-a | 0.158 | 0.081 | exit 0 | load 68.7 of 60 mean, peak 8.9 GB | replay batch 4 at 3c0b39ce, 40 workers, 5000 of 5000 games |
| 2026-11-07 13:18 PST | yf-b7 | c3d-highcpu-60 | us-central1-a | 0.342 | 0.176 | exit 0 | load 62.2 of 60 mean, peak 12.4 GB | replay batch 7 at 3c0b39ce, 40 workers, 3000 of 3000 games |
| 2026-11-07 13:19 PST | yf-b6 | c3d-highcpu-60 | us-east1-b | 0.482 | 0.248 | exit 0 | load 59.5 of 60 mean, peak 13.9 GB | replay batch 6 at 3c0b39ce, 40 workers, 3000 of 3000 games |
| 2026-11-07 13:19 PST | yf-b5 | c3d-highcpu-60 | us-west1-c | 0.516 | 0.266 | exit 0 | load 58.5 of 60 mean, peak 13.3 GB | replay batch 5 at 3c0b39ce, 40 workers, 3000 of 3000 games |
| 2026-11-07 13:47 PST | yf-b1 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 49.6 of 60 mean, peak 7.7 GB | replay batch 1 at 3c0b39ce, 40 workers, 5000 of 5000 games |
| 2026-11-07 13:47 PST | yf-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.8 of 60 mean, peak 7.8 GB | replay batch 3 at 3c0b39ce, 40 workers, 5000 of 5000 games |
| 2026-11-07 13:53 PST | yf-b2r | c3d-highcpu-60 | us-central1-b | 0.091 | 0.047 | exit 0 | load 50.4 of 60 mean, peak 7.8 GB | replay batch 2 at 3c0b39ce, 40 workers, 5000 of 5000 games |
| 2026-11-07 15:45 PST | yp-b4 | c3d-highcpu-60 | us-west1-a | 0.159 | 0.082 | exit 0 | load 69.1 of 60 mean, peak 8.9 GB | replay batch 4 at 96bfbff3, 40 workers, 5000 of 5000 games |
| 2026-11-07 15:57 PST | yp-b1 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.046 | exit 0 | load 46.7 of 60 mean, peak 7.3 GB | replay batch 1 at 96bfbff3, 40 workers, 5000 of 5000 games |
| 2026-11-07 15:44 PST | yp-b7 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 63.1 of 60 mean, peak 11.8 GB | replay batch 7 at 96bfbff3, 40 workers, 3000 of 3000 games |
| 2026-11-07 16:04 PST | yp-b2 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.046 | exit 0 | load 50.6 of 60 mean, peak 7.9 GB | replay batch 2 at 96bfbff3, 40 workers, 5000 of 5000 games |
| 2026-11-07 16:09 PST | yp-b3 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 46.7 of 60 mean, peak 7.6 GB | replay batch 3 at 96bfbff3, 40 workers, 5000 of 5000 games |
| 2026-11-07 15:45 PST | yp-b6 | c3d-highcpu-60 | us-east1-b | 0.498 | 0.257 | exit 0 | load 59.1 of 60 mean, peak 14.0 GB | replay batch 6 at 96bfbff3, 40 workers, 3000 of 3000 games |
| 2026-11-07 15:44 PST | yp-b5 | c3d-highcpu-60 | us-central1-a | 0.547 | 0.282 | exit 0 | load 58.3 of 60 mean, peak 13.2 GB | replay batch 5 at 96bfbff3, 40 workers, 3000 of 3000 games |
| 2026-11-07 17:49 PST | pf-b4 | c3d-highcpu-60 | us-west1-a | 0.158 | 0.081 | exit 0 | load 69.4 of 60 mean, peak 9.6 GB | replay batch 4 at 139a426c, 40 workers, 5000 of 5000 games |
| 2026-11-07 18:00 PST | pf-b1 | c3d-highcpu-60 | us-west1-c | 0.088 | 0.045 | exit 0 | load 48.3 of 60 mean, peak 7.3 GB | replay batch 1 at 139a426c, 40 workers, 5000 of 5000 games |
| 2026-11-07 17:48 PST | pf-b7 | c3d-highcpu-60 | us-central1-a | 0.339 | 0.175 | exit 0 | load 61.3 of 60 mean, peak 11.6 GB | replay batch 7 at 139a426c, 40 workers, 3000 of 3000 games |
| 2026-11-07 18:06 PST | pf-b2 | c3d-highcpu-60 | us-west1-c | 0.089 | 0.046 | exit 0 | load 50.5 of 60 mean, peak 7.8 GB | replay batch 2 at 139a426c, 40 workers, 5000 of 5000 games |
| 2026-11-07 18:12 PST | pf-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.7 of 60 mean, peak 7.3 GB | replay batch 3 at 139a426c, 40 workers, 5000 of 5000 games |
| 2026-11-07 17:48 PST | pf-b5 | c3d-highcpu-60 | us-east1-b | 0.509 | 0.262 | exit 0 | load 59.1 of 60 mean, peak 14.3 GB | replay batch 5 at 139a426c, 40 workers, 3000 of 3000 games |
| 2026-11-07 17:48 PST | pf-b6 | c3d-highcpu-60 | us-central1-a | 0.544 | 0.280 | exit 0 | load 59.9 of 60 mean, peak 14.3 GB | replay batch 6 at 139a426c, 40 workers, 3000 of 3000 games |
| 2026-11-07 20:23 PST | ds1-b4 | c3d-highcpu-60 | us-west1-c | 0.123 | 0.063 | exit 0 | load 67.2 of 60 mean, peak 8.6 GB | replay batch 4 at 7ca5c36d, 40 workers, 5000 of 5000 games |
| 2026-11-07 20:21 PST | ds1-b7 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.118 | exit 0 | load 70.3 of 60 mean, peak 11.3 GB | replay batch 7 at 7ca5c36d, 40 workers, 3000 of 3000 games |
| 2026-11-07 20:31 PST | ds1-b1 | c3d-highcpu-60 | us-west1-c | 0.089 | 0.046 | exit 0 | load 48.7 of 60 mean, peak 7.2 GB | replay batch 1 at 7ca5c36d, 40 workers, 5000 of 5000 games |
| 2026-11-07 20:21 PST | ds1-b5 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 67.5 of 60 mean, peak 14.0 GB | replay batch 5 at 7ca5c36d, 40 workers, 3000 of 3000 games |
| 2026-11-07 20:22 PST | ds1-b6 | c3d-highcpu-60 | us-east1-b | 0.333 | 0.172 | exit 0 | load 68.8 of 60 mean, peak 13.7 GB | replay batch 6 at 7ca5c36d, 40 workers, 3000 of 3000 games |
| 2026-11-07 20:37 PST | ds1-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.9 of 60 mean, peak 7.2 GB | replay batch 2 at 7ca5c36d, 40 workers, 5000 of 5000 games |
| 2026-11-07 20:42 PST | ds1-b3 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.045 | exit 0 | load 48.8 of 60 mean, peak 7.4 GB | replay batch 3 at 7ca5c36d, 40 workers, 5000 of 5000 games |
| 2026-11-07 23:37 PST | ds2-b4 | c3d-highcpu-60 | us-west1-c | 0.123 | 0.063 | exit 0 | load 67.3 of 60 mean, peak 9.0 GB | replay batch 4 at f2aef9aa, 40 workers, 5000 of 5000 games |
| 2026-11-07 23:36 PST | ds2-b7 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.118 | exit 0 | load 70.9 of 60 mean, peak 12.5 GB | replay batch 7 at f2aef9aa, 40 workers, 3000 of 3000 games |
| 2026-11-07 23:46 PST | ds2-b1 | c3d-highcpu-60 | us-west1-c | 0.088 | 0.045 | exit 0 | load 50.3 of 60 mean, peak 7.4 GB | replay batch 1 at f2aef9aa, 40 workers, 5000 of 5000 games |
| 2026-11-07 23:36 PST | ds2-b5 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 67.4 of 60 mean, peak 14.5 GB | replay batch 5 at f2aef9aa, 40 workers, 3000 of 3000 games |
| 2026-11-07 23:36 PST | ds2-b6 | c3d-highcpu-60 | us-east1-b | 0.334 | 0.172 | exit 0 | load 67.3 of 60 mean, peak 14.4 GB | replay batch 6 at f2aef9aa, 40 workers, 3000 of 3000 games |
| 2026-11-07 23:51 PST | ds2-b2 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 48.4 of 60 mean, peak 7.5 GB | replay batch 2 at f2aef9aa, 40 workers, 5000 of 5000 games |
| 2026-11-07 23:57 PST | ds2-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.7 of 60 mean, peak 7.1 GB | replay batch 3 at f2aef9aa, 40 workers, 5000 of 5000 games |
| 2026-11-08 01:40 PST | y6b-b4 | c3d-highcpu-60 | us-west1-a | 0.127 | 0.065 | exit 0 | load 67.7 of 60 mean, peak 8.8 GB | replay batch 4 at 986eec40, 40 workers, 5000 of 5000 games |
| 2026-11-08 01:39 PST | y6b-b7 | c3d-highcpu-60 | us-central1-a | 0.201 | 0.104 | exit 0 | load 68.9 of 60 mean, peak 12.1 GB | replay batch 7 at 986eec40, 40 workers, 3000 of 3000 games |
| 2026-11-08 01:49 PST | y6b-b1 | c3d-highcpu-60 | us-west1-a | 0.094 | 0.048 | exit 0 | load 50.1 of 60 mean, peak 7.6 GB | replay batch 1 at 986eec40, 40 workers, 5000 of 5000 games |
| 2026-11-08 01:40 PST | y6b-b5 | c3d-highcpu-60 | us-central1-a | 0.306 | 0.158 | exit 0 | load 67.4 of 60 mean, peak 14.2 GB | replay batch 5 at 986eec40, 40 workers, 3000 of 3000 games |
| 2026-11-08 01:40 PST | y6b-b6 | c3d-highcpu-60 | us-east1-b | 0.304 | 0.157 | exit 0 | load 68.9 of 60 mean, peak 14.1 GB | replay batch 6 at 986eec40, 40 workers, 3000 of 3000 games |
| 2026-11-08 01:55 PST | y6b-b2 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 49.4 of 60 mean, peak 7.4 GB | replay batch 2 at 986eec40, 40 workers, 5000 of 5000 games |
| 2026-11-08 02:01 PST | y6b-b3 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.048 | exit 0 | load 53.7 of 60 mean, peak 7.5 GB | replay batch 3 at 986eec40, 40 workers, 5000 of 5000 games |
| 2026-11-08 02:38 PST | y6c-b4 | c3d-highcpu-60 | us-east1-b | 0.123 | 0.063 | exit 0 | load 67.4 of 60 mean, peak 8.6 GB | replay batch 4 at 73c87bb0, 40 workers, 5000 of 5000 games |
| 2026-11-08 02:38 PST | y6c-b7 | c3d-highcpu-60 | us-central1-a | 0.228 | 0.118 | exit 0 | load 69.9 of 60 mean, peak 11.2 GB | replay batch 7 at 73c87bb0, 40 workers, 3000 of 3000 games |
| 2026-11-08 02:47 PST | y6c-b1 | c3d-highcpu-60 | us-east1-b | 0.087 | 0.045 | exit 0 | load 49.5 of 60 mean, peak 7.4 GB | replay batch 1 at 73c87bb0, 40 workers, 5000 of 5000 games |
| 2026-11-08 02:39 PST | y6c-b6 | c3d-highcpu-60 | us-west1-a | 0.299 | 0.154 | exit 0 | load 69.2 of 60 mean, peak 13.1 GB | replay batch 6 at 73c87bb0, 40 workers, 3000 of 3000 games |
| 2026-11-08 02:52 PST | y6c-b2 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 49.4 of 60 mean, peak 7.6 GB | replay batch 2 at 73c87bb0, 40 workers, 5000 of 5000 games |
| 2026-11-08 02:38 PST | y6c-b5 | c3d-highcpu-60 | us-central1-a | 0.332 | 0.171 | exit 0 | load 68.2 of 60 mean, peak 12.7 GB | replay batch 5 at 73c87bb0, 40 workers, 3000 of 3000 games |
| 2026-11-08 02:58 PST | y6c-b3 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 53.0 of 60 mean, peak 7.4 GB | replay batch 3 at 73c87bb0, 40 workers, 5000 of 5000 games |
| 2026-11-08 09:21 PST | ren-b4 | c3d-highcpu-60 | us-east1-c | 0.159 | 0.082 | exit 0 | load 72.3 of 60 mean, peak 8.4 GB | replay batch 4 at ea2f4564, 40 workers, 5000 of 5000 games |
| 2026-11-08 09:21 PST | ren-b7 | c3d-highcpu-60 | us-central1-a | 0.236 | 0.122 | exit 0 | load 70.0 of 60 mean, peak 11.1 GB | replay batch 7 at ea2f4564, 40 workers, 3000 of 3000 games |
| 2026-11-08 09:32 PST | ren-b1 | c3d-highcpu-60 | us-east1-c | 0.096 | 0.049 | exit 0 | load 49.6 of 60 mean, peak 7.3 GB | replay batch 1 at ea2f4564, 40 workers, 5000 of 5000 games |
| 2026-11-08 09:21 PST | ren-b6 | c3d-highcpu-60 | us-west1-c | 0.308 | 0.159 | exit 0 | load 69.1 of 60 mean, peak 13.1 GB | replay batch 6 at ea2f4564, 40 workers, 3000 of 3000 games |
| 2026-11-08 09:21 PST | ren-b5 | c3d-highcpu-60 | us-central1-a | 0.348 | 0.179 | exit 0 | load 68.3 of 60 mean, peak 14.3 GB | replay batch 5 at ea2f4564, 40 workers, 3000 of 3000 games |
| 2026-11-08 09:38 PST | ren-b2 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 50.0 of 60 mean, peak 7.0 GB | replay batch 2 at ea2f4564, 40 workers, 5000 of 5000 games |
| 2026-11-08 09:44 PST | ren-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 51.6 of 60 mean, peak 7.5 GB | replay batch 3 at ea2f4564, 40 workers, 5000 of 5000 games |
| 2026-11-08 09:43 PST | stk-b7 | c3d-highcpu-60 | us-central1-a | 0.231 | 0.119 | exit 0 | load 69.8 of 60 mean, peak 11.1 GB | replay batch 7 at c6d32dc1, 40 workers, 3000 of 3000 games |
| 2026-11-08 09:50 PST | stk-b4 | c3d-highcpu-60 | us-central1-a | 0.164 | 0.085 | exit 0 | load 72.3 of 60 mean, peak 8.5 GB | replay batch 4 at c6d32dc1, 40 workers, 5000 of 5000 games |
| 2026-11-08 09:44 PST | stk-b6 | c3d-highcpu-60 | us-west1-c | 0.300 | 0.155 | exit 0 | load 68.7 of 60 mean, peak 13.2 GB | replay batch 6 at c6d32dc1, 40 workers, 3000 of 3000 games |
| 2026-11-08 09:44 PST | stk-b5 | c3d-highcpu-60 | us-east1-c | 0.336 | 0.173 | exit 0 | load 68.4 of 60 mean, peak 13.6 GB | replay batch 5 at c6d32dc1, 40 workers, 3000 of 3000 games |
| 2026-11-08 10:00 PST | stk-b1 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 51.3 of 60 mean, peak 7.6 GB | replay batch 1 at c6d32dc1, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:06 PST | stk-b2 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 48.8 of 60 mean, peak 7.0 GB | replay batch 2 at c6d32dc1, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:12 PST | stk-b3 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 50.0 of 60 mean, peak 7.4 GB | replay batch 3 at c6d32dc1, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:19 PST | rst-b4 | c3d-highcpu-60 | us-east1-c | 0.126 | 0.065 | exit 0 | load 69.0 of 60 mean, peak 8.5 GB | replay batch 4 at 2050842b, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:19 PST | rst-b7 | c3d-highcpu-60 | us-west1-c | 0.195 | 0.101 | exit 0 | load 68.5 of 60 mean, peak 11.5 GB | replay batch 7 at 2050842b, 40 workers, 3000 of 3000 games |
| 2026-11-08 10:28 PST | rst-b1 | c3d-highcpu-60 | us-east1-c | 0.091 | 0.047 | exit 0 | load 47.5 of 60 mean, peak 7.6 GB | replay batch 1 at 2050842b, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:18 PST | rst-b5 | c3d-highcpu-60 | us-central1-a | 0.353 | 0.182 | exit 0 | load 67.6 of 60 mean, peak 14.0 GB | replay batch 5 at 2050842b, 40 workers, 3000 of 3000 games |
| 2026-11-08 10:18 PST | rst-b6 | c3d-highcpu-60 | us-central1-a | 0.354 | 0.182 | exit 0 | load 69.3 of 60 mean, peak 13.9 GB | replay batch 6 at 2050842b, 40 workers, 3000 of 3000 games |
| 2026-11-08 10:34 PST | rst-b2 | c3d-highcpu-60 | us-east1-c | 0.102 | 0.053 | exit 0 | load 49.9 of 60 mean, peak 7.4 GB | replay batch 2 at 2050842b, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:41 PST | rst-b3 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.048 | exit 0 | load 53.1 of 60 mean, peak 7.3 GB | replay batch 3 at 2050842b, 40 workers, 5000 of 5000 games |
| 2026-11-08 10:47 PST | b8-b | c3d-highcpu-60 | us-central1-a | 0.225 | 0.116 | exit 0 | load 60.0 of 60 mean, peak 10.5 GB | record batch 8 at c6d32dc1, 40 workers, 1500 of 1500 games |
| 2026-11-08 10:47 PST | b8-a | c3d-highcpu-60 | us-central1-a | 0.228 | 0.118 | exit 0 | load 58.8 of 60 mean, peak 10.3 GB | record batch 8 at c6d32dc1, 40 workers, 1500 of 1500 games |
| 2026-11-08 11:01 PST | ord-b6 | c3d-highcpu-60 | us-central1-a | 0.351 | 0.181 | exit 0 | load 68.3 of 60 mean, peak 14.1 GB | replay batch 6 at 736a444d, 40 workers, 3000 of 3000 games |
| 2026-11-08 11:01 PST | ord-b5 | c3d-highcpu-60 | us-central1-b | 0.351 | 0.181 | exit 0 | load 67.1 of 60 mean, peak 12.9 GB | replay batch 5 at 736a444d, 40 workers, 3000 of 3000 games |
| 2026-11-08 11:06 PST | b8r-2050842 | c3d-highcpu-60 | us-east1-b | 0.310 | 0.160 | exit 0 | load 70.3 of 60 mean, peak 12.0 GB | replay batch 8 at 2050842b, 40 workers, 3000 of 3000 games |
| 2026-11-08 11:23 PST | ord-b4 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 68.3 of 60 mean, peak 8.6 GB | replay batch 4 at 736a444d, 40 workers, 5000 of 5000 games |
| 2026-11-08 11:31 PST | ord-b1 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 49.3 of 60 mean, peak 7.2 GB | replay batch 1 at 736a444d, 40 workers, 5000 of 5000 games |
| 2026-11-08 11:22 PST | ord-b7 | c3d-highcpu-60 | us-central1-a | 0.271 | 0.140 | exit 0 | load 70.1 of 60 mean, peak 11.8 GB | replay batch 7 at 736a444d, 40 workers, 3000 of 3000 games |
| 2026-11-08 11:41 PST | ord-b3 | c3d-highcpu-60 | us-central1-a | 0.106 | 0.055 | exit 0 | load 57.5 of 60 mean, peak 6.9 GB | replay batch 3 at 736a444d, 40 workers, 5000 of 5000 games |
| 2026-11-08 11:41 PST | ord-b2 | c3d-highcpu-60 | us-central1-a | 0.113 | 0.058 | exit 0 | load 58.8 of 60 mean, peak 7.2 GB | replay batch 2 at 736a444d, 40 workers, 5000 of 5000 games |
| 2026-11-08 11:49 PST | b8r-736a444 | c3d-highcpu-60 | us-central1-a | 0.291 | 0.150 | exit 0 | load 72.5 of 60 mean, peak 12.7 GB | replay batch 8 at 736a444d, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:01 PST | msc-b4 | c3d-highcpu-60 | us-east1-b | 0.149 | 0.077 | exit 0 | load 68.9 of 60 mean, peak 8.7 GB | replay batch 4 at 0151d154, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:00 PST | msc-b7 | c3d-highcpu-60 | us-central1-a | 0.221 | 0.114 | exit 0 | load 69.5 of 60 mean, peak 11.1 GB | replay batch 7 at 0151d154, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:11 PST | msc-b1 | c3d-highcpu-60 | us-east1-c | 0.106 | 0.055 | exit 0 | load 48.9 of 60 mean, peak 7.4 GB | replay batch 1 at 0151d154, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:00 PST | msc-b6 | c3d-highcpu-60 | us-central1-a | 0.337 | 0.174 | exit 0 | load 69.4 of 60 mean, peak 12.5 GB | replay batch 6 at 0151d154, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:01 PST | msc-b5 | c3d-highcpu-60 | us-west1-a | 0.338 | 0.174 | exit 0 | load 67.5 of 60 mean, peak 13.7 GB | replay batch 5 at 0151d154, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:18 PST | msc-b2 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 48.2 of 60 mean, peak 7.1 GB | replay batch 2 at 0151d154, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:24 PST | msc-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.6 of 60 mean, peak 7.2 GB | replay batch 3 at 0151d154, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:22 PST | msc-b8 | c3d-highcpu-60 | us-central1-a | 0.237 | 0.122 | exit 0 | load 69.0 of 60 mean, peak 12.9 GB | replay batch 8 at 0151d154, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:39 PST | lit-b4 | c3d-highcpu-60 | us-east1-c | 0.163 | 0.084 | exit 0 | load 71.7 of 60 mean, peak 8.4 GB | replay batch 4 at 3a2cad98, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:38 PST | lit-b7 | c3d-highcpu-60 | us-central1-a | 0.237 | 0.122 | exit 0 | load 70.1 of 60 mean, peak 11.2 GB | replay batch 7 at 3a2cad98, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:49 PST | lit-b1 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.045 | exit 0 | load 49.5 of 60 mean, peak 7.1 GB | replay batch 1 at 3a2cad98, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:39 PST | lit-b5 | c3d-highcpu-60 | us-west1-a | 0.303 | 0.156 | exit 0 | load 67.8 of 60 mean, peak 14.7 GB | replay batch 5 at 3a2cad98, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:38 PST | lit-b6 | c3d-highcpu-60 | us-central1-a | 0.354 | 0.182 | exit 0 | load 69.0 of 60 mean, peak 14.0 GB | replay batch 6 at 3a2cad98, 40 workers, 3000 of 3000 games |
| 2026-11-08 13:55 PST | lit-b2 | c3d-highcpu-60 | us-east1-c | 0.107 | 0.055 | exit 0 | load 48.1 of 60 mean, peak 7.3 GB | replay batch 2 at 3a2cad98, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:02 PST | lit-b3 | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 52.6 of 60 mean, peak 7.4 GB | replay batch 3 at 3a2cad98, 40 workers, 5000 of 5000 games |
| 2026-11-08 13:52 PST | lit-b8 | c3d-highcpu-60 | us-central1-a | 0.286 | 0.147 | exit 0 | load 69.2 of 60 mean, peak 12.3 GB | replay batch 8 at 3a2cad98, 40 workers, 3000 of 3000 games |
| 2026-11-08 14:11 PST | bon-b4 | c3d-highcpu-60 | us-west1-a | 0.140 | 0.072 | exit 0 | load 67.9 of 60 mean, peak 8.6 GB | replay batch 4 at bf8334a4, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:11 PST | bon-b7 | c3d-highcpu-60 | us-east1-b | 0.214 | 0.110 | exit 0 | load 70.9 of 60 mean, peak 11.5 GB | replay batch 7 at bf8334a4, 40 workers, 3000 of 3000 games |
| 2026-11-08 14:22 PST | bon-b1 | c3d-highcpu-60 | us-west1-a | 0.110 | 0.057 | exit 0 | load 49.3 of 60 mean, peak 7.2 GB | replay batch 1 at bf8334a4, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:10 PST | bon-b5 | c3d-highcpu-60 | us-central1-a | 0.352 | 0.181 | exit 0 | load 68.3 of 60 mean, peak 14.3 GB | replay batch 5 at bf8334a4, 40 workers, 3000 of 3000 games |
| 2026-11-08 14:10 PST | bon-b6 | c3d-highcpu-60 | us-central1-a | 0.352 | 0.181 | exit 0 | load 69.6 of 60 mean, peak 13.1 GB | replay batch 6 at bf8334a4, 40 workers, 3000 of 3000 games |
| 2026-11-08 14:31 PST | bon-b2 | c3d-highcpu-60 | us-west1-a | 0.120 | 0.062 | exit 0 | load 47.7 of 60 mean, peak 7.9 GB | replay batch 2 at bf8334a4, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:26 PST | bon-b8 | c3d-highcpu-60 | us-east1-b | 0.247 | 0.127 | exit 0 | load 70.9 of 60 mean, peak 11.9 GB | replay batch 8 at bf8334a4, 40 workers, 3000 of 3000 games |
| 2026-11-08 14:40 PST | bon-b3 | c3d-highcpu-60 | us-central1-a | 0.136 | 0.070 | exit 0 | load 59.2 of 60 mean, peak 7.5 GB | replay batch 3 at bf8334a4, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:53 PST | lmp-b4 | c3d-highcpu-60 | us-west1-a | 0.155 | 0.080 | exit 0 | load 66.2 of 60 mean, peak 8.7 GB | replay batch 4 at 4db41b1a, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:51 PST | lmp-b7 | c3d-highcpu-60 | us-central1-a | 0.236 | 0.122 | exit 0 | load 69.2 of 60 mean, peak 11.4 GB | replay batch 7 at 4db41b1a, 40 workers, 3000 of 3000 games |
| 2026-11-08 15:05 PST | lmp-b1 | c3d-highcpu-60 | us-west1-a | 0.093 | 0.048 | exit 0 | load 50.2 of 60 mean, peak 8.0 GB | replay batch 1 at 4db41b1a, 40 workers, 5000 of 5000 games |
| 2026-11-08 14:51 PST | lmp-b5 | c3d-highcpu-60 | us-central1-a | 0.340 | 0.175 | exit 0 | load 68.6 of 60 mean, peak 14.4 GB | replay batch 5 at 4db41b1a, 40 workers, 3000 of 3000 games |
| 2026-11-08 14:52 PST | lmp-b6 | c3d-highcpu-60 | us-east1-b | 0.340 | 0.175 | exit 0 | load 67.2 of 60 mean, peak 12.2 GB | replay batch 6 at 4db41b1a, 40 workers, 3000 of 3000 games |
| 2026-11-08 15:11 PST | lmp-b2 | c3d-highcpu-60 | us-central1-c | 0.091 | 0.047 | exit 0 | load 47.1 of 60 mean, peak 7.2 GB | replay batch 2 at 4db41b1a, 40 workers, 5000 of 5000 games |
| 2026-11-08 15:06 PST | lmp-b8 | c3d-highcpu-60 | us-central1-a | 0.270 | 0.139 | exit 0 | load 69.4 of 60 mean, peak 12.4 GB | replay batch 8 at 4db41b1a, 40 workers, 3000 of 3000 games |
| 2026-11-08 15:17 PST | lmp-b3 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 48.9 of 60 mean, peak 6.9 GB | replay batch 3 at 4db41b1a, 40 workers, 5000 of 5000 games |
| 2026-11-08 15:23 PST | stk3-b4 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 65.3 of 60 mean, peak 8.2 GB | replay batch 4 at c81e0f89, 40 workers, 5000 of 5000 games |
| 2026-11-08 15:24 PST | stk3-b7 | c3d-highcpu-60 | us-west1-a | 0.193 | 0.099 | exit 0 | load 69.0 of 60 mean, peak 11.9 GB | replay batch 7 at c81e0f89, 40 workers, 3000 of 3000 games |
| 2026-11-08 15:31 PST | stk3-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.3 of 60 mean, peak 7.3 GB | replay batch 1 at c81e0f89, 40 workers, 5000 of 5000 games |
| 2026-11-08 15:24 PST | stk3-b6 | c3d-highcpu-60 | us-east1-b | 0.300 | 0.155 | exit 0 | load 68.6 of 60 mean, peak 13.8 GB | replay batch 6 at c81e0f89, 40 workers, 3000 of 3000 games |
| 2026-11-08 15:37 PST | stk3-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 52.1 of 60 mean, peak 7.2 GB | replay batch 2 at c81e0f89, 40 workers, 5000 of 5000 games |
| 2026-11-08 15:23 PST | stk3-b5 | c3d-highcpu-60 | us-central1-a | 0.374 | 0.193 | exit 0 | load 67.7 of 60 mean, peak 14.0 GB | replay batch 5 at c81e0f89, 40 workers, 3000 of 3000 games |
| 2026-11-08 15:43 PST | stk3-b3 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 52.8 of 60 mean, peak 7.2 GB | replay batch 3 at c81e0f89, 40 workers, 5000 of 5000 games |
| 2026-11-08 15:37 PST | stk3-b8 | c3d-highcpu-60 | us-west1-a | 0.263 | 0.136 | exit 0 | load 68.9 of 60 mean, peak 12.8 GB | replay batch 8 at c81e0f89, 40 workers, 3000 of 3000 games |
| 2026-11-08 16:30 PST | shp-b4 | c3d-highcpu-60 | us-west1-a | 0.175 | 0.090 | exit 0 | load 67.9 of 60 mean, peak 8.6 GB | replay batch 4 at d685acaf, 40 workers, 5000 of 5000 games |
| 2026-11-08 16:29 PST | shp-b7 | c3d-highcpu-60 | us-central1-a | 0.232 | 0.120 | exit 0 | load 69.3 of 60 mean, peak 11.2 GB | replay batch 7 at d685acaf, 40 workers, 3000 of 3000 games |
| 2026-11-08 16:29 PST | shp-b6 | c3d-highcpu-60 | us-central1-a | 0.302 | 0.156 | exit 0 | load 68.0 of 60 mean, peak 14.0 GB | replay batch 6 at d685acaf, 40 workers, 3000 of 3000 games |
| 2026-11-08 16:43 PST | shp-b1 | c3d-highcpu-60 | us-west1-a | 0.093 | 0.048 | exit 0 | load 48.1 of 60 mean, peak 8.0 GB | replay batch 1 at d685acaf, 40 workers, 5000 of 5000 games |
| 2026-11-08 16:30 PST | shp-b5 | c3d-highcpu-60 | us-east1-b | 0.339 | 0.175 | exit 0 | load 67.7 of 60 mean, peak 14.0 GB | replay batch 5 at d685acaf, 40 workers, 3000 of 3000 games |
| 2026-11-08 16:49 PST | shp-b2 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 49.7 of 60 mean, peak 7.6 GB | replay batch 2 at d685acaf, 40 workers, 5000 of 5000 games |
| 2026-11-08 16:54 PST | shp-b3 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 49.0 of 60 mean, peak 7.4 GB | replay batch 3 at d685acaf, 40 workers, 5000 of 5000 games |
| 2026-11-08 16:44 PST | shp-b8 | c3d-highcpu-60 | us-central1-a | 0.269 | 0.139 | exit 0 | load 70.0 of 60 mean, peak 12.2 GB | replay batch 8 at d685acaf, 40 workers, 3000 of 3000 games |
| 2026-11-08 17:01 PST | a11-b4 | c3d-highcpu-60 | us-west1-a | 0.159 | 0.082 | exit 0 | load 69.7 of 60 mean, peak 9.0 GB | replay batch 4 at 222039b8, 40 workers, 5000 of 5000 games |
| 2026-11-08 17:00 PST | a11-b7 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.118 | exit 0 | load 70.0 of 60 mean, peak 11.0 GB | replay batch 7 at 222039b8, 40 workers, 3000 of 3000 games |
| 2026-11-08 17:12 PST | a11-b1 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.045 | exit 0 | load 50.0 of 60 mean, peak 7.2 GB | replay batch 1 at 222039b8, 40 workers, 5000 of 5000 games |
| 2026-11-08 17:01 PST | a11-b6 | c3d-highcpu-60 | us-east1-c | 0.311 | 0.160 | exit 0 | load 69.6 of 60 mean, peak 13.1 GB | replay batch 6 at 222039b8, 40 workers, 3000 of 3000 games |
| 2026-11-08 17:00 PST | a11-b5 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 68.5 of 60 mean, peak 14.0 GB | replay batch 5 at 222039b8, 40 workers, 3000 of 3000 games |
| 2026-11-08 17:18 PST | a11-b2 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.045 | exit 0 | load 48.3 of 60 mean, peak 7.3 GB | replay batch 2 at 222039b8, 40 workers, 5000 of 5000 games |
| 2026-11-08 17:24 PST | a11-b3 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 51.6 of 60 mean, peak 7.5 GB | replay batch 3 at 222039b8, 40 workers, 5000 of 5000 games |
| 2026-11-08 17:14 PST | a11-b8 | c3d-highcpu-60 | us-central1-a | 0.263 | 0.136 | exit 0 | load 69.5 of 60 mean, peak 12.7 GB | replay batch 8 at 222039b8, 40 workers, 3000 of 3000 games |
| 2026-11-08 17:31 PST | b9-a | c3d-highcpu-60 | us-central1-a | 0.262 | 0.135 | exit 0 | load 61.1 of 60 mean, peak 11.4 GB | record batch 9 at d685acaf, 40 workers, 1500 of 1500 games |
| 2026-11-08 17:31 PST | b9-b | c3d-highcpu-60 | us-central1-a | 0.268 | 0.138 | exit 0 | load 61.2 of 60 mean, peak 10.4 GB | record batch 9 at d685acaf, 40 workers, 1500 of 1500 games |
| 2026-11-08 17:59 PST | cas-b4 | c3d-highcpu-60 | us-west1-a | 0.122 | 0.063 | exit 0 | load 68.0 of 60 mean, peak 8.6 GB | replay batch 4 at 7d24a8d6, 40 workers, 5000 of 5000 games |
| 2026-11-08 17:53 PST | b9r-222039b | c3d-highcpu-60 | us-central1-a | 0.229 | 0.118 | exit 0 | load 69.5 of 60 mean, peak 12.7 GB | replay batch 9 at 222039b8, 40 workers, 3000 of 3000 games |
| 2026-11-08 17:58 PST | cas-b7 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.118 | exit 0 | load 69.7 of 60 mean, peak 11.6 GB | replay batch 7 at 7d24a8d6, 40 workers, 3000 of 3000 games |
| 2026-11-08 18:07 PST | cas-b1 | c3d-highcpu-60 | us-west1-a | 0.092 | 0.047 | exit 0 | load 51.6 of 60 mean, peak 7.9 GB | replay batch 1 at 7d24a8d6, 40 workers, 5000 of 5000 games |
| 2026-11-08 18:13 PST | cas-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.4 of 60 mean, peak 7.2 GB | replay batch 2 at 7d24a8d6, 40 workers, 5000 of 5000 games |
| 2026-11-08 17:58 PST | cas-b5 | c3d-highcpu-60 | us-east1-b | 0.372 | 0.192 | exit 0 | load 67.9 of 60 mean, peak 13.2 GB | replay batch 5 at 7d24a8d6, 40 workers, 3000 of 3000 games |
| 2026-11-08 18:19 PST | cas-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.5 of 60 mean, peak 7.1 GB | replay batch 3 at 7d24a8d6, 40 workers, 5000 of 5000 games |
| 2026-11-08 18:12 PST | cas-b8 | c3d-highcpu-60 | us-central1-a | 0.231 | 0.119 | exit 0 | load 69.3 of 60 mean, peak 13.0 GB | replay batch 8 at 7d24a8d6, 40 workers, 3000 of 3000 games |
| 2026-11-08 18:21 PST | cas-b6 | c3d-highcpu-60 | us-east1-b | 0.338 | 0.174 | exit 0 | load 68.9 of 60 mean, peak 13.7 GB | replay batch 6 at 7d24a8d6, 40 workers, 3000 of 3000 games |
| 2026-11-08 18:42 PST | cas-b9 | c3d-highcpu-60 | us-central1-a | 0.271 | 0.140 | exit 0 | load 70.2 of 60 mean, peak 12.4 GB | replay batch 9 at 7d24a8d6, 40 workers, 3000 of 3000 games |
| 2026-11-08 19:11 PST | a1s-b4 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 69.5 of 60 mean, peak 8.4 GB | replay batch 4 at 2b9667a0, 40 workers, 5000 of 5000 games |
| 2026-11-08 19:19 PST | a1s-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 48.4 of 60 mean, peak 7.0 GB | replay batch 1 at 2b9667a0, 40 workers, 5000 of 5000 games |
| 2026-11-08 19:10 PST | a1s-b9 | c3d-highcpu-60 | us-central1-a | 0.234 | 0.121 | exit 0 | load 68.8 of 60 mean, peak 12.7 GB | replay batch 9 at 2b9667a0, 40 workers, 3000 of 3000 games |
| 2026-11-08 19:11 PST | a1s-b7 | c3d-highcpu-60 | us-west1-a | 0.314 | 0.162 | exit 0 | load 63.3 of 60 mean, peak 11.7 GB | replay batch 7 at 2b9667a0, 40 workers, 3000 of 3000 games |
| 2026-11-08 19:25 PST | a1s-b2 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.049 | exit 0 | load 46.7 of 60 mean, peak 7.3 GB | replay batch 2 at 2b9667a0, 40 workers, 5000 of 5000 games |
| 2026-11-08 19:31 PST | a1s-b3 | c3d-highcpu-60 | us-central1-a | 0.105 | 0.054 | exit 0 | load 51.9 of 60 mean, peak 7.7 GB | replay batch 3 at 2b9667a0, 40 workers, 5000 of 5000 games |
| 2026-11-08 19:11 PST | a1s-b5 | c3d-highcpu-60 | us-east1-b | 0.476 | 0.245 | exit 0 | load 66.3 of 60 mean, peak 14.1 GB | replay batch 5 at 2b9667a0, 40 workers, 3000 of 3000 games |
| 2026-11-08 19:31 PST | a1s-b8 | c3d-highcpu-60 | us-central1-a | 0.281 | 0.145 | exit 0 | load 69.9 of 60 mean, peak 12.6 GB | replay batch 8 at 2b9667a0, 40 workers, 3000 of 3000 games |
| 2026-11-08 19:40 PST | a1s-b6 | c3d-highcpu-60 | us-central1-a | 0.305 | 0.157 | exit 0 | load 69.0 of 60 mean, peak 14.1 GB | replay batch 6 at 2b9667a0, 40 workers, 3000 of 3000 games |
| 2026-11-08 20:02 PST | mis-b4 | c3d-highcpu-60 | us-central1-a | 0.142 | 0.073 | exit 0 | load 66.3 of 60 mean, peak 8.4 GB | replay batch 4 at 145441ce, 40 workers, 5000 of 5000 games |
| 2026-11-08 20:02 PST | mis-b7 | c3d-highcpu-60 | us-central1-a | 0.222 | 0.114 | exit 0 | load 69.5 of 60 mean, peak 11.6 GB | replay batch 7 at 145441ce, 40 workers, 3000 of 3000 games |
| 2026-11-08 20:12 PST | mis-b1 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.049 | exit 0 | load 49.9 of 60 mean, peak 7.3 GB | replay batch 1 at 145441ce, 40 workers, 5000 of 5000 games |
| 2026-11-08 20:03 PST | mis-b9 | c3d-highcpu-60 | us-west1-c | 0.250 | 0.129 | exit 0 | load 70.6 of 60 mean, peak 12.4 GB | replay batch 9 at 145441ce, 40 workers, 3000 of 3000 games |
| 2026-11-08 20:03 PST | mis-b5 | c3d-highcpu-60 | us-east1-c | 0.323 | 0.166 | exit 0 | load 68.3 of 60 mean, peak 14.8 GB | replay batch 5 at 145441ce, 40 workers, 3000 of 3000 games |
| 2026-11-08 20:18 PST | mis-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.7 of 60 mean, peak 7.5 GB | replay batch 2 at 145441ce, 40 workers, 5000 of 5000 games |
| 2026-11-08 20:24 PST | mis-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.4 of 60 mean, peak 7.7 GB | replay batch 3 at 145441ce, 40 workers, 5000 of 5000 games |
| 2026-11-08 20:16 PST | mis-b8 | c3d-highcpu-60 | us-central1-a | 0.264 | 0.136 | exit 0 | load 69.0 of 60 mean, peak 13.0 GB | replay batch 8 at 145441ce, 40 workers, 3000 of 3000 games |
| 2026-11-08 20:23 PST | mis-b6 | c3d-highcpu-60 | us-east1-c | 0.300 | 0.155 | exit 0 | load 68.7 of 60 mean, peak 14.5 GB | replay batch 6 at 145441ce, 40 workers, 3000 of 3000 games |
| 2026-11-08 20:42 PST | b10-a | c3d-highcpu-60 | us-central1-a | 0.256 | 0.132 | exit 0 | load 57.7 of 60 mean, peak 11.7 GB | record batch 10 at 9f7e42e6, 40 workers, 1500 of 1500 games |
| 2026-11-08 20:42 PST | b10-b | c3d-highcpu-60 | us-central1-a | 0.293 | 0.151 | exit 0 | load 58.3 of 60 mean, peak 12.2 GB | record batch 10 at 9f7e42e6, 40 workers, 1500 of 1500 games |
| 2026-11-08 21:14 PST | b10r-6d3efe1 | c3d-highcpu-60 | us-central1-a | 0.335 | 0.173 | exit 0 | load 64.3 of 60 mean, peak 15.3 GB | replay batch 10 at 6d3efe16, 40 workers, 3000 of 3000 games |
| 2026-11-08 21:28 PST | lst-b4 | c3d-highcpu-60 | us-west1-c | 0.123 | 0.063 | exit 0 | load 70.4 of 60 mean, peak 8.5 GB | replay batch 4 at b122e48e, 40 workers, 5000 of 5000 games |
| 2026-11-08 21:36 PST | lst-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 47.1 of 60 mean, peak 7.6 GB | replay batch 1 at b122e48e, 40 workers, 5000 of 5000 games |
| 2026-11-08 21:28 PST | lst-b7 | c3d-highcpu-60 | us-central1-a | 0.230 | 0.119 | exit 0 | load 69.5 of 60 mean, peak 11.0 GB | replay batch 7 at b122e48e, 40 workers, 3000 of 3000 games |
| 2026-11-08 21:42 PST | lst-b2 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.048 | exit 0 | load 50.1 of 60 mean, peak 7.3 GB | replay batch 2 at b122e48e, 40 workers, 5000 of 5000 games |
| 2026-11-08 21:28 PST | lst-b5 | c3d-highcpu-60 | us-east1-c | 0.344 | 0.177 | exit 0 | load 68.3 of 60 mean, peak 14.3 GB | replay batch 5 at b122e48e, 40 workers, 3000 of 3000 games |
| 2026-11-08 21:48 PST | lst-b3 | c3d-highcpu-60 | us-central1-a | 0.118 | 0.061 | exit 0 | load 51.2 of 60 mean, peak 7.3 GB | replay batch 3 at b122e48e, 40 workers, 5000 of 5000 games |
| 2026-11-08 21:42 PST | lst-b8 | c3d-highcpu-60 | us-central1-a | 0.270 | 0.139 | exit 0 | load 68.6 of 60 mean, peak 13.2 GB | replay batch 8 at b122e48e, 40 workers, 3000 of 3000 games |
| 2026-11-08 21:51 PST | lst-b6 | c3d-highcpu-60 | us-east1-c | 0.324 | 0.167 | exit 0 | load 68.3 of 60 mean, peak 12.9 GB | replay batch 6 at b122e48e, 40 workers, 3000 of 3000 games |
| 2026-11-08 21:59 PST | lst-b9 | c3d-highcpu-60 | us-central1-a | 0.234 | 0.121 | exit 0 | load 69.4 of 60 mean, peak 12.6 GB | replay batch 9 at b122e48e, 40 workers, 3000 of 3000 games |
| 2026-11-08 22:11 PST | lst-b10 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 63.7 of 60 mean, peak 14.3 GB | replay batch 10 at b122e48e, 40 workers, 3000 of 3000 games |
| 2026-11-08 22:32 PST | lso-b4 | c3d-highcpu-60 | us-central1-f | 0.132 | 0.068 | exit 0 | load 69.7 of 60 mean, peak 8.6 GB | replay batch 4 at f84b90ad, 40 workers, 5000 of 5000 games |
| 2026-11-08 22:33 PST | lso-b7 | c3d-highcpu-60 | us-west1-c | 0.208 | 0.107 | exit 0 | load 69.7 of 60 mean, peak 11.9 GB | replay batch 7 at f84b90ad, 40 workers, 3000 of 3000 games |
| 2026-11-08 22:41 PST | lso-b1 | c3d-highcpu-60 | us-central1-b | 0.096 | 0.049 | exit 0 | load 51.6 of 60 mean, peak 7.4 GB | replay batch 1 at f84b90ad, 40 workers, 5000 of 5000 games |
| 2026-11-08 22:33 PST | lso-b5 | c3d-highcpu-60 | us-west1-c | 0.325 | 0.168 | exit 0 | load 67.0 of 60 mean, peak 13.8 GB | replay batch 5 at f84b90ad, 40 workers, 3000 of 3000 games |
| 2026-11-08 22:32 PST | lso-b10 | c3d-highcpu-60 | us-central1-b | 0.360 | 0.186 | exit 0 | load 65.6 of 60 mean, peak 14.9 GB | replay batch 10 at f84b90ad, 40 workers, 3000 of 3000 games |
| 2026-11-08 22:48 PST | lso-b2 | c3d-highcpu-60 | us-east1-c | 0.100 | 0.052 | exit 0 | load 50.9 of 60 mean, peak 7.1 GB | replay batch 2 at f84b90ad, 40 workers, 5000 of 5000 games |
| 2026-11-08 22:55 PST | lso-b3 | c3d-highcpu-60 | us-central1-b | 0.091 | 0.047 | exit 0 | load 53.7 of 60 mean, peak 7.0 GB | replay batch 3 at f84b90ad, 40 workers, 5000 of 5000 games |
| 2026-11-08 22:47 PST | lso-b8 | c3d-highcpu-60 | us-central1-c | 0.281 | 0.145 | exit 0 | load 67.5 of 60 mean, peak 12.6 GB | replay batch 8 at f84b90ad, 40 workers, 3000 of 3000 games |
| 2026-11-08 22:54 PST | lso-b6 | c3d-highcpu-60 | us-west1-c | 0.304 | 0.157 | exit 0 | load 68.3 of 60 mean, peak 14.6 GB | replay batch 6 at f84b90ad, 40 workers, 3000 of 3000 games |
| 2026-11-08 23:04 PST | lso-b9 | c3d-highcpu-60 | us-central1-b | 0.285 | 0.147 | exit 0 | load 69.6 of 60 mean, peak 13.3 GB | replay batch 9 at f84b90ad, 40 workers, 3000 of 3000 games |
| 2026-11-08 23:16 PST | b11-b | c3d-highcpu-60 | us-central1-b | 0.085 | 0.044 | exit 0 | load 56.2 of 60 mean, peak 7.5 GB | record batch 11 at b122e48e, 40 workers, 750 of 750 games |
| 2026-11-08 23:16 PST | b11-a | c3d-highcpu-60 | us-east1-c | 0.082 | 0.042 | exit 0 | load 40.5 of 60 mean, peak 7.7 GB | record batch 11 at b122e48e, 40 workers, 750 of 750 games |
| 2026-11-08 23:25 PST | gate-355a40f7-b11 | c3d-highcpu-60 | us-central1-b | 0.092 | 0.047 | exit 0 | load 57.7 of 60 mean, peak 9.7 GB | replay batch 11 at 355a40f7, 40 workers, 1500 of 1500 games |
| 2026-11-08 23:25 PST | gate-355a40f7-b10 | c3d-highcpu-60 | us-central1-b | 0.420 | 0.216 | exit 0 | load 64.0 of 60 mean, peak 14.3 GB | replay batch 10 at 355a40f7, 40 workers, 3000 of 3000 games |
| 2026-11-09 01:54 PST | gate-6577cb4d-b11 | c3d-highcpu-60 | us-central1-a | 0.102 | 0.053 | exit 0 | load 59.8 of 60 mean, peak 9.9 GB | replay batch 11 at 6577cb4d, 40 workers, 1500 of 1500 games |
| 2026-11-09 02:00 PST | gate-16c1dccb-b3 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.046 | exit 0 | load 47.7 of 60 mean, peak 7.8 GB | replay batch 3 at 16c1dccb, 40 workers, 5000 of 5000 games |
| 2026-11-09 02:01 PST | gate-16c1dccb-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 51.2 of 60 mean, peak 7.3 GB | replay batch 2 at 16c1dccb, 40 workers, 5000 of 5000 games |
| 2026-11-09 02:01 PST | gate-16c1dccb-b1 | c3d-highcpu-60 | us-west1-c | 0.089 | 0.046 | exit 0 | load 47.5 of 60 mean, peak 7.3 GB | replay batch 1 at 16c1dccb, 40 workers, 5000 of 5000 games |
| 2026-11-09 01:54 PST | gate-6577cb4d-b10 | c3d-highcpu-60 | us-central1-a | 0.410 | 0.211 | exit 0 | load 64.1 of 60 mean, peak 13.8 GB | replay batch 10 at 6577cb4d, 40 workers, 3000 of 3000 games |
| 2026-11-09 02:06 PST | gate-16c1dccb-b7 | c3d-highcpu-60 | us-central1-a | 0.231 | 0.119 | exit 0 | load 68.7 of 60 mean, peak 11.8 GB | replay batch 7 at 16c1dccb, 40 workers, 3000 of 3000 games |
| 2026-11-09 02:07 PST | gate-16c1dccb-b6 | c3d-highcpu-60 | us-east1-c | 0.301 | 0.155 | exit 0 | load 67.4 of 60 mean, peak 13.6 GB | replay batch 6 at 16c1dccb, 40 workers, 3000 of 3000 games |
| 2026-11-09 02:07 PST | gate-16c1dccb-b5 | c3d-highcpu-60 | us-west1-c | 0.337 | 0.174 | exit 0 | load 66.6 of 60 mean, peak 14.0 GB | replay batch 5 at 16c1dccb, 40 workers, 3000 of 3000 games |
| 2026-11-09 02:20 PST | gate-16c1dccb-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 63.4 of 60 mean, peak 10.0 GB | replay batch 11 at 16c1dccb, 40 workers, 1500 of 1500 games |
| 2026-11-09 02:25 PST | gate-b33085af-b11 | c3d-highcpu-60 | us-west1-a | 0.098 | 0.051 | exit 0 | load 59.3 of 60 mean, peak 9.9 GB | replay batch 11 at b33085af, 40 workers, 1500 of 1500 games |
| 2026-11-09 02:37 PST | b12-a | c3d-highcpu-60 | us-east1-c | 0.061 | 0.031 | script exited early | not sampled | record batch 12 at 6577cb4d, 40 workers, 0 of 750 games |
| 2026-11-09 02:37 PST | b12-b | c3d-highcpu-60 | us-west1-c | 0.060 | 0.031 | script exited early | not sampled | record batch 12 at 6577cb4d, 40 workers, 0 of 750 games |
| 2026-11-09 02:28 PST | gate-16c1dccb-b9 | c3d-highcpu-60 | us-central1-a | 0.267 | 0.138 | exit 0 | load 67.8 of 60 mean, peak 12.7 GB | replay batch 9 at 16c1dccb, 40 workers, 3000 of 3000 games |
| 2026-11-09 02:23 PST | gate-b33085af-b10 | c3d-highcpu-60 | us-central1-a | 0.389 | 0.200 | exit 0 | load 63.9 of 60 mean, peak 15.4 GB | replay batch 10 at b33085af, 40 workers, 3000 of 3000 games |
| 2026-11-09 02:44 PST | b12-a-2 | c3d-highcpu-60 | us-central1-b | 0.121 | 0.062 | exit 0 | load 60.4 of 60 mean, peak 8.2 GB | record batch 12 at 6577cb4d, 40 workers, 750 of 750 games |
| 2026-11-09 02:45 PST | b12-b-2 | c3d-highcpu-60 | us-east1-c | 0.120 | 0.062 | exit 0 | load 50.6 of 60 mean, peak 7.7 GB | record batch 12 at 6577cb4d, 40 workers, 750 of 750 games |
| 2026-11-09 02:48 PST | gate-bc005720-b11 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 58.7 of 60 mean, peak 9.6 GB | replay batch 11 at bc005720, 40 workers, 1500 of 1500 games |
| 2026-11-09 02:49 PST | gate-bc005720-b10 | c3d-highcpu-60 | us-west1-c | 0.370 | 0.191 | exit 0 | load 64.7 of 60 mean, peak 14.4 GB | replay batch 10 at bc005720, 40 workers, 3000 of 3000 games |
| 2026-11-09 03:30 PST | gate-8e0431b3-b11 | c3d-highcpu-60 | us-central1-a | 0.107 | 0.055 | exit 0 | load 61.0 of 60 mean, peak 9.8 GB | replay batch 11 at 8e0431b3, 40 workers, 1500 of 1500 games |
| 2026-11-09 03:31 PST | gate-8e0431b3-b12 | c3d-highcpu-60 | us-east1-c | 0.104 | 0.054 | exit 0 | load 58.5 of 60 mean, peak 9.9 GB | replay batch 12 at 8e0431b3, 40 workers, 1500 of 1500 games |
| 2026-11-09 03:30 PST | gate-8e0431b3-b10 | c3d-highcpu-60 | us-central1-a | 0.429 | 0.221 | exit 0 | load 64.0 of 60 mean, peak 14.7 GB | replay batch 10 at 8e0431b3, 40 workers, 3000 of 3000 games |
| 2026-11-09 04:28 PST | gate-aa17637e-b12 | c3d-highcpu-60 | us-central1-a | 0.131 | 0.068 | exit 0 | load 60.2 of 60 mean, peak 9.7 GB | replay batch 12 at aa17637e, 40 workers, 1500 of 1500 games |
| 2026-11-09 04:30 PST | gate-aa17637e-b11 | c3d-highcpu-60 | us-east1-c | 0.132 | 0.068 | exit 0 | load 57.5 of 60 mean, peak 9.6 GB | replay batch 11 at aa17637e, 40 workers, 1500 of 1500 games |
| 2026-11-09 04:28 PST | gate-aa17637e-b10 | c3d-highcpu-60 | us-central1-a | 0.382 | 0.197 | exit 0 | load 66.3 of 60 mean, peak 14.2 GB | replay batch 10 at aa17637e, 40 workers, 3000 of 3000 games |
| 2026-11-09 05:41 PST | fill-aa17637e-b4 | c3d-highcpu-60 | us-central1-b | 0.130 | 0.067 | exit 0 | load 67.4 of 60 mean, peak 8.7 GB | replay batch 4 at aa17637e, 40 workers, 5000 of 5000 games |
| 2026-11-09 05:52 PST | gate-09e38b12-b11 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 59.0 of 60 mean, peak 9.9 GB | replay batch 11 at 09e38b12, 40 workers, 1500 of 1500 games |
| 2026-11-09 05:53 PST | gate-09e38b12-b12 | c3d-highcpu-60 | us-east1-c | 0.093 | 0.048 | exit 0 | load 58.2 of 60 mean, peak 10.2 GB | replay batch 12 at 09e38b12, 40 workers, 1500 of 1500 games |
| 2026-11-09 05:41 PST | fill-aa17637e-b8 | c3d-highcpu-60 | us-central1-b | 0.312 | 0.161 | exit 0 | load 66.2 of 60 mean, peak 12.1 GB | replay batch 8 at aa17637e, 40 workers, 3000 of 3000 games |
| 2026-11-09 06:09 PST | gate-09486819-b12 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.049 | exit 0 | load 56.6 of 60 mean, peak 10.0 GB | replay batch 12 at 09486819, 40 workers, 1500 of 1500 games |
| 2026-11-09 06:09 PST | gate-09486819-b11 | c3d-highcpu-60 | us-central1-c | 0.096 | 0.049 | exit 0 | load 55.2 of 60 mean, peak 9.7 GB | replay batch 11 at 09486819, 40 workers, 1500 of 1500 games |
| 2026-11-09 07:45 PST | gate-ca10dd7c-b12 | c3d-highcpu-60 | us-central1-c | 0.108 | 0.056 | exit 0 | load 60.0 of 60 mean, peak 10.2 GB | replay batch 12 at ca10dd7c, 40 workers, 1500 of 1500 games |
| 2026-11-09 07:46 PST | gate-ca10dd7c-b11 | c3d-highcpu-60 | us-central1-c | 0.107 | 0.055 | exit 0 | load 57.4 of 60 mean, peak 9.4 GB | replay batch 11 at ca10dd7c, 40 workers, 1500 of 1500 games |
| 2026-11-09 08:14 PST | gate-16303303-b12 | c3d-highcpu-60 | us-central1-a | 0.098 | 0.051 | exit 0 | load 59.2 of 60 mean, peak 9.9 GB | replay batch 12 at 16303303, 40 workers, 1500 of 1500 games |
| 2026-11-09 08:15 PST | gate-16303303-b11 | c3d-highcpu-60 | us-central1-a | 0.098 | 0.051 | exit 0 | load 58.6 of 60 mean, peak 10.5 GB | replay batch 11 at 16303303, 40 workers, 1500 of 1500 games |
| 2026-11-09 09:12 PST | gate-55f1d4f0-b11 | c3d-highcpu-60 | us-central1-a | 0.109 | 0.056 | exit 0 | load 60.5 of 60 mean, peak 9.9 GB | replay batch 11 at 55f1d4f0, 40 workers, 1500 of 1500 games |
| 2026-11-09 09:12 PST | gate-55f1d4f0-b12 | c3d-highcpu-60 | us-central1-a | 0.111 | 0.057 | exit 0 | load 61.7 of 60 mean, peak 9.7 GB | replay batch 12 at 55f1d4f0, 40 workers, 1500 of 1500 games |
| 2026-11-09 09:13 PST | dneg1-55f1d4f0-b9 | c3d-highcpu-60 | us-east1-b | 0.294 | 0.152 | exit 0 | load 63.3 of 60 mean, peak 13.1 GB | replay batch 9 at 55f1d4f0, 40 workers, 3000 of 3000 games |
| 2026-11-09 09:51 PST | gate-6b505724-b12 | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 61.2 of 60 mean, peak 9.6 GB | replay batch 12 at 6b505724, 40 workers, 1500 of 1500 games |
| 2026-11-09 09:52 PST | gate-6b505724-b11 | c3d-highcpu-60 | us-central1-a | 0.101 | 0.052 | exit 0 | load 57.2 of 60 mean, peak 9.7 GB | replay batch 11 at 6b505724, 40 workers, 1500 of 1500 games |
| 2026-11-09 10:22 PST | gate-67ddbc7b-b11 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 60.2 of 60 mean, peak 9.7 GB | replay batch 11 at 67ddbc7b, 40 workers, 1500 of 1500 games |
| 2026-11-09 10:22 PST | gate-67ddbc7b-b12 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.052 | exit 0 | load 58.4 of 60 mean, peak 9.5 GB | replay batch 12 at 67ddbc7b, 40 workers, 1500 of 1500 games |
| 2026-11-09 10:38 PST | gate-b7e50278-b11 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.049 | exit 0 | load 60.6 of 60 mean, peak 10.2 GB | replay batch 11 at b7e50278, 40 workers, 1500 of 1500 games |
| 2026-11-09 10:38 PST | gate-b7e50278-b12 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.069 | exit 0 | load 64.8 of 60 mean, peak 9.8 GB | replay batch 12 at b7e50278, 40 workers, 1500 of 1500 games |
| 2026-11-09 10:50 PST | gate-4c35739e-b11 | c3d-highcpu-60 | us-central1-c | 0.090 | 0.049 | exit 0 | load 58.3 of 60 mean, peak 9.5 GB | replay batch 11 at 4c35739e, 40 workers, 1500 of 1500 games |
| 2026-11-09 10:50 PST | gate-4c35739e-b12 | c3d-highcpu-60 | us-central1-c | 0.091 | 0.049 | exit 0 | load 56.9 of 60 mean, peak 10.2 GB | replay batch 12 at 4c35739e, 40 workers, 1500 of 1500 games |
| 2026-11-11 20:33 PST | gate-4c35739e-b1 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.047 | exit 0 | load 49.5 of 60 mean, peak 7.0 GB | replay batch 1 at 4c35739e, 40 workers, 5000 of 5000 games |
| 2026-11-11 20:34 PST | gate-4c35739e-b2 | c3d-highcpu-60 | us-east1-b | 0.087 | 0.047 | exit 0 | load 47.7 of 60 mean, peak 7.9 GB | replay batch 2 at 4c35739e, 40 workers, 5000 of 5000 games |
| 2026-11-11 20:34 PST | gate-4c35739e-b3 | c3d-highcpu-60 | us-west1-c | 0.087 | 0.047 | exit 0 | load 49.9 of 60 mean, peak 7.5 GB | replay batch 3 at 4c35739e, 40 workers, 5000 of 5000 games |
| 2026-11-11 20:33 PST | gate-4c35739e-b4 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 68.0 of 60 mean, peak 8.7 GB | replay batch 4 at 4c35739e, 40 workers, 5000 of 5000 games |
| 2026-11-11 20:41 PST | gate-4c35739e-b8 | c3d-highcpu-60 | us-central1-a | 0.268 | 0.145 | exit 0 | load 68.7 of 60 mean, peak 13.1 GB | replay batch 8 at 4c35739e, 40 workers, 3000 of 3000 games |
| 2026-11-11 20:40 PST | gate-4c35739e-b6 | c3d-highcpu-60 | us-east1-b | 0.301 | 0.163 | exit 0 | load 67.4 of 60 mean, peak 13.9 GB | replay batch 6 at 4c35739e, 40 workers, 3000 of 3000 games |
| 2026-11-11 20:58 PST | gate-4c35739e-b12 | c3d-highcpu-60 | us-central1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 12 at 4c35739e, 40 workers, 1500 of 1500 games |
| 2026-11-11 20:39 PST | gate-4c35739e-b5 | c3d-highcpu-60 | us-central1-a | 0.338 | 0.183 | exit 0 | load 66.4 of 60 mean, peak 14.1 GB | replay batch 5 at 4c35739e, 40 workers, 3000 of 3000 games |
| 2026-11-11 20:55 PST | gate-4c35739e-b7 | c3d-highcpu-60 | us-west1-c | 0.234 | 0.127 | exit 0 | load 67.5 of 60 mean, peak 11.5 GB | replay batch 7 at 4c35739e, 40 workers, 3000 of 3000 games |
| 2026-11-11 21:10 PST | gate-4c35739e-b11 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 11 at 4c35739e, 40 workers, 1500 of 1500 games |
| 2026-11-11 21:00 PST | gate-4c35739e-b9 | c3d-highcpu-60 | us-central1-a | 0.271 | 0.147 | exit 0 | load 68.4 of 60 mean, peak 12.9 GB | replay batch 9 at 4c35739e, 40 workers, 3000 of 3000 games |
| 2026-11-11 20:59 PST | gate-4c35739e-b10 | c3d-highcpu-60 | us-central1-b | 0.382 | 0.207 | exit 0 | load 63.5 of 60 mean, peak 14.0 GB | replay batch 10 at 4c35739e, 40 workers, 3000 of 3000 games |
| 2026-11-11 21:48 PST | gate-6a4f0ad5-b12 | c3d-highcpu-60 | us-central1-a | 0.107 | 0.058 | exit 0 | load 56.8 of 60 mean, peak 10.0 GB | replay batch 12 at 6a4f0ad5, 40 workers, 1500 of 1500 games |
| 2026-11-11 21:48 PST | gate-6a4f0ad5-b11 | c3d-highcpu-60 | us-central1-a | 0.108 | 0.058 | exit 0 | load 61.6 of 60 mean, peak 9.4 GB | replay batch 11 at 6a4f0ad5, 40 workers, 1500 of 1500 games |
| 2026-11-11 22:40 PST | gate-3028bdb2-b12 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 56.8 of 60 mean, peak 10.3 GB | replay batch 12 at 3028bdb2, 40 workers, 1500 of 1500 games |
| 2026-11-11 22:58 PST | gate-daffa7db-b12 | c3d-highcpu-60 | us-central1-a | 0.101 | 0.055 | exit 0 | load 58.0 of 60 mean, peak 10.1 GB | replay batch 12 at daffa7db, 40 workers, 1500 of 1500 games |
| 2026-11-12 00:22 PST | gate-8a7ec296-b12 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 59.8 of 60 mean, peak 10.1 GB | replay batch 12 at 8a7ec296, 40 workers, 1500 of 1500 games |
| 2026-11-12 00:43 PST | gate-15028e15-b12 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 64.6 of 60 mean, peak 9.7 GB | replay batch 12 at 15028e15, 40 workers, 1500 of 1500 games |
| 2026-11-12 00:57 PST | gate-bc1ce389-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 51.0 of 60 mean, peak 7.7 GB | replay batch 1 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 00:58 PST | gate-bc1ce389-b2 | c3d-highcpu-60 | us-east1-b | 0.088 | 0.048 | exit 0 | load 49.2 of 60 mean, peak 7.8 GB | replay batch 2 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 00:59 PST | gate-bc1ce389-b3 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 53.4 of 60 mean, peak 7.7 GB | replay batch 3 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 00:57 PST | gate-bc1ce389-b4 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.4 of 60 mean, peak 9.0 GB | replay batch 4 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 01:05 PST | gate-bc1ce389-b7 | c3d-highcpu-60 | us-central1-f | 0.225 | 0.122 | exit 0 | load 67.1 of 60 mean, peak 11.5 GB | replay batch 7 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 01:06 PST | gate-bc1ce389-b8 | c3d-highcpu-60 | us-west1-a | 0.263 | 0.142 | exit 0 | load 67.9 of 60 mean, peak 13.1 GB | replay batch 8 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 01:04 PST | gate-bc1ce389-b6 | c3d-highcpu-60 | us-east1-b | 0.298 | 0.161 | exit 0 | load 67.0 of 60 mean, peak 14.3 GB | replay batch 6 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 01:03 PST | gate-bc1ce389-b5 | c3d-highcpu-60 | us-central1-a | 0.376 | 0.204 | exit 0 | load 65.8 of 60 mean, peak 15.0 GB | replay batch 5 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 01:19 PST | gate-bc1ce389-b11 | c3d-highcpu-60 | us-central1-a | 0.107 | 0.058 | exit 0 | load 59.4 of 60 mean, peak 9.6 GB | replay batch 11 at bc1ce389, 40 workers, 1500 of 1500 games |
| 2026-11-12 01:24 PST | gate-bc1ce389-b12 | c3d-highcpu-60 | us-east1-b | 0.111 | 0.060 | exit 0 | load 60.0 of 60 mean, peak 10.3 GB | replay batch 12 at bc1ce389, 40 workers, 1500 of 1500 games |
| 2026-11-12 01:27 PST | gate-bc1ce389-b9 | c3d-highcpu-60 | us-central1-a | 0.282 | 0.153 | exit 0 | load 67.2 of 60 mean, peak 12.9 GB | replay batch 9 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 01:24 PST | gate-bc1ce389-b10 | c3d-highcpu-60 | us-west1-a | 0.363 | 0.196 | exit 0 | load 64.9 of 60 mean, peak 14.6 GB | replay batch 10 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:00 PST | gate-bc1ce389-b3 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 3 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 02:00 PST | gate-bc1ce389-b2 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 2 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 02:01 PST | gate-bc1ce389-b1 | c3d-highcpu-60 | us-west1-a | 0.012 | 0.006 | exit 0 | not sampled | replay batch 1 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 02:00 PST | gate-bc1ce389-b4 | c3d-highcpu-60 | us-east1-b | 0.019 | 0.010 | exit 0 | not sampled | replay batch 4 at bc1ce389, 40 workers, 5000 of 5000 games |
| 2026-11-12 02:01 PST | gate-bc1ce389-b7 | c3d-highcpu-60 | us-central1-a | 0.011 | 0.006 | exit 0 | not sampled | replay batch 7 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:01 PST | gate-bc1ce389-b6 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 6 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:02 PST | gate-bc1ce389-b8 | c3d-highcpu-60 | us-east1-b | 0.012 | 0.006 | exit 0 | not sampled | replay batch 8 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:02 PST | gate-bc1ce389-b5 | c3d-highcpu-60 | us-central1-c | 0.019 | 0.010 | exit 0 | not sampled | replay batch 5 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:03 PST | gate-bc1ce389-b11 | c3d-highcpu-60 | us-central1-c | 0.015 | 0.008 | exit 0 | not sampled | replay batch 11 at bc1ce389, 40 workers, 1500 of 1500 games |
| 2026-11-12 02:03 PST | gate-bc1ce389-b12 | c3d-highcpu-60 | us-central1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 12 at bc1ce389, 40 workers, 1500 of 1500 games |
| 2026-11-12 02:03 PST | gate-bc1ce389-b10 | c3d-highcpu-60 | us-east1-b | 0.019 | 0.010 | exit 0 | not sampled | replay batch 10 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:04 PST | gate-bc1ce389-b9 | c3d-highcpu-60 | us-central1-f | 0.020 | 0.011 | exit 0 | not sampled | replay batch 9 at bc1ce389, 40 workers, 3000 of 3000 games |
| 2026-11-12 02:21 PST | gate-06813d44-b12 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 62.1 of 60 mean, peak 10.1 GB | replay batch 12 at 06813d44, 40 workers, 1500 of 1500 games |
| 2026-11-12 02:53 PST | gate-6d01c8e7-b12 | c3d-highcpu-60 | us-central1-a | 0.102 | 0.055 | exit 0 | load 61.3 of 60 mean, peak 9.7 GB | replay batch 12 at 6d01c8e7, 40 workers, 1500 of 1500 games |
| 2026-11-12 03:41 PST | gate-ed28aa0a-b12 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.069 | exit 0 | load 63.6 of 60 mean, peak 10.2 GB | replay batch 12 at ed28aa0a, 40 workers, 1500 of 1500 games |
| 2026-11-12 05:06 PST | gate-e51c27b7-b12 | c3d-highcpu-60 | us-central1-a | 0.133 | 0.072 | exit 0 | load 68.0 of 60 mean, peak 10.0 GB | replay batch 12 at e51c27b7, 40 workers, 1500 of 1500 games |
| 2026-11-12 05:44 PST | gate-e77df088-b2 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 48.5 of 60 mean, peak 7.0 GB | replay batch 2 at e77df088, 40 workers, 5000 of 5000 games |
| 2026-11-12 05:46 PST | gate-e77df088-b3 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 48.4 of 60 mean, peak 7.5 GB | replay batch 3 at e77df088, 40 workers, 5000 of 5000 games |
| 2026-11-12 05:46 PST | gate-e77df088-b1 | c3d-highcpu-60 | us-west1-c | 0.088 | 0.048 | exit 0 | load 57.4 of 60 mean, peak 6.8 GB | replay batch 1 at e77df088, 40 workers, 5000 of 5000 games |
| 2026-11-12 05:44 PST | gate-e77df088-b4 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 66.5 of 60 mean, peak 8.9 GB | replay batch 4 at e77df088, 40 workers, 5000 of 5000 games |
| 2026-11-12 05:52 PST | gate-e77df088-b7 | c3d-highcpu-60 | us-east1-b | 0.234 | 0.127 | exit 0 | load 68.6 of 60 mean, peak 11.1 GB | replay batch 7 at e77df088, 40 workers, 3000 of 3000 games |
| 2026-11-12 05:53 PST | gate-e77df088-b8 | c3d-highcpu-60 | us-west1-c | 0.270 | 0.146 | exit 0 | load 68.9 of 60 mean, peak 12.5 GB | replay batch 8 at e77df088, 40 workers, 3000 of 3000 games |
| 2026-11-12 05:50 PST | gate-e77df088-b6 | c3d-highcpu-60 | us-central1-a | 0.341 | 0.185 | exit 0 | load 67.4 of 60 mean, peak 13.3 GB | replay batch 6 at e77df088, 40 workers, 3000 of 3000 games |
| 2026-11-12 05:52 PST | gate-e77df088-b5 | c3d-highcpu-60 | us-central1-c | 0.341 | 0.185 | exit 0 | load 65.9 of 60 mean, peak 13.2 GB | replay batch 5 at e77df088, 40 workers, 3000 of 3000 games |
| 2026-11-12 06:07 PST | gate-e77df088-b11 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 66.7 of 60 mean, peak 9.4 GB | replay batch 11 at e77df088, 40 workers, 1500 of 1500 games |
| 2026-11-12 06:11 PST | gate-e77df088-b12 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 60.8 of 60 mean, peak 9.6 GB | replay batch 12 at e77df088, 40 workers, 1500 of 1500 games |
| 2026-11-12 06:13 PST | gate-e77df088-b9 | c3d-highcpu-60 | us-central1-a | 0.265 | 0.143 | exit 0 | load 67.3 of 60 mean, peak 13.6 GB | replay batch 9 at e77df088, 40 workers, 3000 of 3000 games |
| 2026-11-12 06:10 PST | gate-e77df088-b10 | c3d-highcpu-60 | us-central1-a | 0.372 | 0.201 | exit 0 | load 63.5 of 60 mean, peak 14.8 GB | replay batch 10 at e77df088, 40 workers, 3000 of 3000 games |
| 2026-11-12 06:56 PST | b13-b | c3d-highcpu-60 | us-central1-b | 0.096 | 0.052 | exit 0 | load 49.3 of 60 mean, peak 9.0 GB | record batch 13 at e51c27b7, 40 workers, 750 of 750 games |
| 2026-11-12 06:56 PST | b13-a | c3d-highcpu-60 | us-central1-b | 0.098 | 0.053 | exit 0 | load 49.8 of 60 mean, peak 8.8 GB | record batch 13 at e51c27b7, 40 workers, 750 of 750 games |
| 2026-11-12 07:04 PST | gate-db5822d2-b3 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 52.5 of 60 mean, peak 7.6 GB | replay batch 3 at db5822d2, 40 workers, 5000 of 5000 games |
| 2026-11-12 07:05 PST | gate-db5822d2-b1 | c3d-highcpu-60 | us-east1-b | 0.088 | 0.048 | exit 0 | load 51.6 of 60 mean, peak 7.9 GB | replay batch 1 at db5822d2, 40 workers, 5000 of 5000 games |
| 2026-11-12 07:05 PST | gate-db5822d2-b2 | c3d-highcpu-60 | us-west1-a | 0.087 | 0.047 | exit 0 | load 58.1 of 60 mean, peak 7.6 GB | replay batch 2 at db5822d2, 40 workers, 5000 of 5000 games |
| 2026-11-12 07:04 PST | gate-db5822d2-b4 | c3d-highcpu-60 | us-central1-b | 0.123 | 0.067 | exit 0 | load 69.7 of 60 mean, peak 8.6 GB | replay batch 4 at db5822d2, 40 workers, 5000 of 5000 games |
| 2026-11-12 07:10 PST | gate-db5822d2-b7 | c3d-highcpu-60 | us-central1-b | 0.229 | 0.124 | exit 0 | load 67.4 of 60 mean, peak 11.5 GB | replay batch 7 at db5822d2, 40 workers, 3000 of 3000 games |
| 2026-11-12 07:12 PST | gate-db5822d2-b8 | c3d-highcpu-60 | us-central1-b | 0.265 | 0.143 | exit 0 | load 68.1 of 60 mean, peak 13.0 GB | replay batch 8 at db5822d2, 40 workers, 3000 of 3000 games |
| 2026-11-12 07:24 PST | gate-db5822d2-b11 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 57.0 of 60 mean, peak 9.6 GB | replay batch 11 at db5822d2, 40 workers, 1500 of 1500 games |
| 2026-11-12 07:11 PST | gate-db5822d2-b5 | c3d-highcpu-60 | us-east1-b | 0.335 | 0.181 | exit 0 | load 67.0 of 60 mean, peak 13.5 GB | replay batch 5 at db5822d2, 40 workers, 3000 of 3000 games |
| 2026-11-12 07:12 PST | gate-db5822d2-b6 | c3d-highcpu-60 | us-west1-a | 0.334 | 0.181 | exit 0 | load 67.2 of 60 mean, peak 13.3 GB | replay batch 6 at db5822d2, 40 workers, 3000 of 3000 games |
| 2026-11-12 07:29 PST | gate-db5822d2-b12 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 58.3 of 60 mean, peak 10.1 GB | replay batch 12 at db5822d2, 40 workers, 1500 of 1500 games |
| 2026-11-12 07:31 PST | gate-db5822d2-b9 | c3d-highcpu-60 | us-central1-b | 0.264 | 0.143 | exit 0 | load 66.6 of 60 mean, peak 12.8 GB | replay batch 9 at db5822d2, 40 workers, 3000 of 3000 games |
| 2026-11-12 07:48 PST | gate-db5822d2-b13 | c3d-highcpu-60 | us-central1-b | 0.124 | 0.067 | exit 0 | load 67.1 of 60 mean, peak 10.0 GB | replay batch 13 at db5822d2, 40 workers, 1500 of 1500 games |
| 2026-11-12 07:33 PST | gate-db5822d2-b10 | c3d-highcpu-60 | us-west1-a | 0.405 | 0.219 | exit 0 | load 66.4 of 60 mean, peak 14.2 GB | replay batch 10 at db5822d2, 40 workers, 3000 of 3000 games |
| 2026-11-12 08:39 PST | gate-c5012e32-b3 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 52.1 of 60 mean, peak 7.3 GB | replay batch 3 at c5012e32, 40 workers, 5000 of 5000 games |
| 2026-11-12 08:40 PST | gate-c5012e32-b1 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 59.6 of 60 mean, peak 7.5 GB | replay batch 1 at c5012e32, 40 workers, 5000 of 5000 games |
| 2026-11-12 08:39 PST | gate-c5012e32-b4 | c3d-highcpu-60 | us-central1-b | 0.124 | 0.067 | exit 0 | load 67.9 of 60 mean, peak 8.8 GB | replay batch 4 at c5012e32, 40 workers, 5000 of 5000 games |
| 2026-11-12 08:40 PST | gate-c5012e32-b2 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 56.6 of 60 mean, peak 7.7 GB | replay batch 2 at c5012e32, 40 workers, 5000 of 5000 games |
| 2026-11-12 08:45 PST | gate-c5012e32-b7 | c3d-highcpu-60 | us-central1-b | 0.228 | 0.123 | exit 0 | load 68.2 of 60 mean, peak 11.1 GB | replay batch 7 at c5012e32, 40 workers, 3000 of 3000 games |
| 2026-11-12 08:47 PST | gate-c5012e32-b8 | c3d-highcpu-60 | us-central1-b | 0.265 | 0.143 | exit 0 | load 69.9 of 60 mean, peak 12.7 GB | replay batch 8 at c5012e32, 40 workers, 3000 of 3000 games |
| 2026-11-12 08:59 PST | gate-c5012e32-b11 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 61.0 of 60 mean, peak 9.8 GB | replay batch 11 at c5012e32, 40 workers, 1500 of 1500 games |
| 2026-11-12 09:03 PST | gate-c5012e32-b12 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 58.5 of 60 mean, peak 10.1 GB | replay batch 12 at c5012e32, 40 workers, 1500 of 1500 games |
| 2026-11-12 08:48 PST | gate-c5012e32-b6 | c3d-highcpu-60 | us-east1-c | 0.335 | 0.181 | exit 0 | load 68.1 of 60 mean, peak 14.0 GB | replay batch 6 at c5012e32, 40 workers, 3000 of 3000 games |
| 2026-11-12 08:47 PST | gate-c5012e32-b5 | c3d-highcpu-60 | us-west1-a | 0.369 | 0.200 | exit 0 | load 66.4 of 60 mean, peak 13.5 GB | replay batch 5 at c5012e32, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:09 PST | gate-c5012e32-b9 | c3d-highcpu-60 | us-central1-b | 0.264 | 0.143 | exit 0 | load 68.2 of 60 mean, peak 12.8 GB | replay batch 9 at c5012e32, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:09 PST | gate-c5012e32-b10 | c3d-highcpu-60 | us-central1-b | 0.334 | 0.181 | exit 0 | load 63.2 of 60 mean, peak 15.0 GB | replay batch 10 at c5012e32, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:25 PST | gate-c5012e32-b13 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 62.5 of 60 mean, peak 10.5 GB | replay batch 13 at c5012e32, 40 workers, 1500 of 1500 games |
| 2026-11-12 09:31 PST | gate-b866bf2a-b3 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 49.7 of 60 mean, peak 7.4 GB | replay batch 3 at b866bf2a, 40 workers, 5000 of 5000 games |
| 2026-11-12 09:31 PST | gate-b866bf2a-b2 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 49.5 of 60 mean, peak 7.3 GB | replay batch 2 at b866bf2a, 40 workers, 5000 of 5000 games |
| 2026-11-12 09:32 PST | gate-b866bf2a-b1 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 49.4 of 60 mean, peak 7.5 GB | replay batch 1 at b866bf2a, 40 workers, 5000 of 5000 games |
| 2026-11-12 09:32 PST | gate-b866bf2a-b4 | c3d-highcpu-60 | us-west1-c | 0.159 | 0.086 | exit 0 | load 74.5 of 60 mean, peak 8.9 GB | replay batch 4 at b866bf2a, 40 workers, 5000 of 5000 games |
| 2026-11-12 09:37 PST | gate-b866bf2a-b7 | c3d-highcpu-60 | us-central1-b | 0.229 | 0.124 | exit 0 | load 68.3 of 60 mean, peak 12.0 GB | replay batch 7 at b866bf2a, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:37 PST | gate-b866bf2a-b6 | c3d-highcpu-60 | us-central1-b | 0.299 | 0.162 | exit 0 | load 68.7 of 60 mean, peak 14.4 GB | replay batch 6 at b866bf2a, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:51 PST | gate-b866bf2a-b11 | c3d-highcpu-60 | us-central1-b | 0.090 | 0.049 | exit 0 | load 60.0 of 60 mean, peak 9.6 GB | replay batch 11 at b866bf2a, 40 workers, 1500 of 1500 games |
| 2026-11-12 09:39 PST | gate-b866bf2a-b5 | c3d-highcpu-60 | us-west1-c | 0.334 | 0.181 | exit 0 | load 65.3 of 60 mean, peak 15.7 GB | replay batch 5 at b866bf2a, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:44 PST | gate-b866bf2a-b8 | c3d-highcpu-60 | us-west1-c | 0.302 | 0.163 | exit 0 | load 68.1 of 60 mean, peak 12.7 GB | replay batch 8 at b866bf2a, 40 workers, 3000 of 3000 games |
| 2026-11-12 10:03 PST | gate-b866bf2a-b12 | c3d-highcpu-60 | us-west1-a | 0.123 | 0.067 | exit 0 | load 69.3 of 60 mean, peak 10.3 GB | replay batch 12 at b866bf2a, 40 workers, 1500 of 1500 games |
| 2026-11-12 09:59 PST | gate-b866bf2a-b9 | c3d-highcpu-60 | us-central1-b | 0.265 | 0.143 | exit 0 | load 68.6 of 60 mean, peak 13.0 GB | replay batch 9 at b866bf2a, 40 workers, 3000 of 3000 games |
| 2026-11-12 09:55 PST | gate-b866bf2a-b10 | c3d-highcpu-60 | us-central1-b | 0.373 | 0.202 | exit 0 | load 64.9 of 60 mean, peak 14.2 GB | replay batch 10 at b866bf2a, 40 workers, 3000 of 3000 games |
| 2026-11-12 10:15 PST | gate-b866bf2a-b13 | c3d-highcpu-60 | us-central1-b | 0.093 | 0.050 | exit 0 | load 62.2 of 60 mean, peak 10.7 GB | replay batch 13 at b866bf2a, 40 workers, 1500 of 1500 games |
| 2026-11-12 10:22 PST | gate-f80324fd-b1 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 49.6 of 60 mean, peak 8.2 GB | replay batch 1 at f80324fd, 40 workers, 5000 of 5000 games |
| 2026-11-12 10:22 PST | gate-f80324fd-b3 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 51.8 of 60 mean, peak 7.7 GB | replay batch 3 at f80324fd, 40 workers, 5000 of 5000 games |
| 2026-11-12 10:22 PST | gate-f80324fd-b2 | c3d-highcpu-60 | us-east1-b | 0.090 | 0.049 | exit 0 | load 50.8 of 60 mean, peak 7.8 GB | replay batch 2 at f80324fd, 40 workers, 5000 of 5000 games |
| 2026-11-12 10:22 PST | gate-f80324fd-b4 | c3d-highcpu-60 | us-west1-a | 0.160 | 0.087 | exit 0 | load 66.5 of 60 mean, peak 8.5 GB | replay batch 4 at f80324fd, 40 workers, 5000 of 5000 games |
| 2026-11-12 10:27 PST | gate-f80324fd-b7 | c3d-highcpu-60 | us-central1-b | 0.231 | 0.125 | exit 0 | load 69.6 of 60 mean, peak 11.5 GB | replay batch 7 at f80324fd, 40 workers, 3000 of 3000 games |
| 2026-11-12 10:28 PST | gate-f80324fd-b6 | c3d-highcpu-60 | us-east1-b | 0.301 | 0.163 | exit 0 | load 67.5 of 60 mean, peak 14.6 GB | replay batch 6 at f80324fd, 40 workers, 3000 of 3000 games |
| 2026-11-12 10:42 PST | gate-f80324fd-b11 | c3d-highcpu-60 | us-central1-b | 0.090 | 0.049 | exit 0 | load 58.2 of 60 mean, peak 10.0 GB | replay batch 11 at f80324fd, 40 workers, 1500 of 1500 games |
| 2026-11-12 10:27 PST | gate-f80324fd-b5 | c3d-highcpu-60 | us-central1-b | 0.336 | 0.182 | exit 0 | load 67.8 of 60 mean, peak 13.9 GB | replay batch 5 at f80324fd, 40 workers, 3000 of 3000 games |
| 2026-11-12 10:33 PST | gate-f80324fd-b8 | c3d-highcpu-60 | us-west1-a | 0.302 | 0.163 | exit 0 | load 69.0 of 60 mean, peak 12.5 GB | replay batch 8 at f80324fd, 40 workers, 3000 of 3000 games |
| 2026-11-12 10:52 PST | gate-f80324fd-b12 | c3d-highcpu-60 | us-central1-b | 0.126 | 0.068 | exit 0 | load 64.1 of 60 mean, peak 10.0 GB | replay batch 12 at f80324fd, 40 workers, 1500 of 1500 games |
| 2026-11-12 10:48 PST | gate-f80324fd-b9 | c3d-highcpu-60 | us-central1-b | 0.267 | 0.145 | exit 0 | load 68.3 of 60 mean, peak 13.7 GB | replay batch 9 at f80324fd, 40 workers, 3000 of 3000 games |
| 2026-11-12 11:04 PST | gate-f80324fd-b13 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 63.9 of 60 mean, peak 10.9 GB | replay batch 13 at f80324fd, 40 workers, 1500 of 1500 games |
| 2026-11-12 10:47 PST | gate-f80324fd-b10 | c3d-highcpu-60 | us-west1-a | 0.408 | 0.221 | exit 0 | load 66.7 of 60 mean, peak 14.1 GB | replay batch 10 at f80324fd, 40 workers, 3000 of 3000 games |
| 2026-11-12 11:27 PST | gate-5409bfde-b2 | c3d-highcpu-60 | us-central1-b | 0.092 | 0.050 | exit 0 | load 48.2 of 60 mean, peak 7.4 GB | replay batch 2 at 5409bfde, 40 workers, 5000 of 5000 games |
| 2026-11-12 11:27 PST | gate-5409bfde-b1 | c3d-highcpu-60 | us-central1-b | 0.092 | 0.050 | exit 0 | load 49.0 of 60 mean, peak 7.6 GB | replay batch 1 at 5409bfde, 40 workers, 5000 of 5000 games |
| 2026-11-12 11:27 PST | gate-5409bfde-b3 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.050 | exit 0 | load 48.5 of 60 mean, peak 7.1 GB | replay batch 3 at 5409bfde, 40 workers, 5000 of 5000 games |
| 2026-11-12 11:28 PST | gate-5409bfde-b4 | c3d-highcpu-60 | us-west1-a | 0.163 | 0.088 | exit 0 | load 74.2 of 60 mean, peak 8.7 GB | replay batch 4 at 5409bfde, 40 workers, 5000 of 5000 games |
| 2026-11-12 11:33 PST | gate-5409bfde-b5 | c3d-highcpu-60 | us-central1-b | 0.350 | 0.189 | exit 0 | load 66.7 of 60 mean, peak 13.2 GB | replay batch 5 at 5409bfde, 40 workers, 3000 of 3000 games |
| 2026-11-12 11:33 PST | gate-5409bfde-b6 | c3d-highcpu-60 | us-central1-b | 0.351 | 0.190 | exit 0 | load 67.9 of 60 mean, peak 14.4 GB | replay batch 6 at 5409bfde, 40 workers, 3000 of 3000 games |
| 2026-11-12 11:41 PST | gate-5409bfde-b7 | c3d-highcpu-60 | us-west1-a | 0.242 | 0.131 | exit 0 | load 70.4 of 60 mean, peak 12.0 GB | replay batch 7 at 5409bfde, 40 workers, 3000 of 3000 games |
| 2026-11-12 11:46 PST | gate-5409bfde-b8 | c3d-highcpu-60 | us-west1-a | 0.287 | 0.155 | exit 0 | load 68.9 of 60 mean, peak 13.1 GB | replay batch 8 at 5409bfde, 40 workers, 3000 of 3000 games |
| 2026-11-12 11:58 PST | gate-5409bfde-b11 | c3d-highcpu-60 | us-west1-a | 0.136 | 0.074 | exit 0 | load 73.3 of 60 mean, peak 9.7 GB | replay batch 11 at 5409bfde, 40 workers, 1500 of 1500 games |
| 2026-11-12 11:54 PST | gate-5409bfde-b9 | c3d-highcpu-60 | us-central1-b | 0.253 | 0.137 | exit 0 | load 69.1 of 60 mean, peak 13.7 GB | replay batch 9 at 5409bfde, 40 workers, 3000 of 3000 games |
| 2026-11-12 12:04 PST | gate-5409bfde-b12 | c3d-highcpu-60 | us-east1-c | 0.097 | 0.053 | exit 0 | load 61.2 of 60 mean, peak 9.9 GB | replay batch 12 at 5409bfde, 40 workers, 1500 of 1500 games |
| 2026-11-12 12:10 PST | gate-5409bfde-b13 | c3d-highcpu-60 | us-central1-b | 0.094 | 0.051 | exit 0 | load 63.5 of 60 mean, peak 10.8 GB | replay batch 13 at 5409bfde, 40 workers, 1500 of 1500 games |
| 2026-11-12 11:54 PST | gate-5409bfde-b10 | c3d-highcpu-60 | us-central1-b | 0.360 | 0.195 | exit 0 | load 63.7 of 60 mean, peak 15.4 GB | replay batch 10 at 5409bfde, 40 workers, 3000 of 3000 games |
| 2026-11-12 12:36 PST | gate-9270f60e-b1 | c3d-highcpu-60 | us-central1-b | 0.091 | 0.049 | exit 0 | load 51.0 of 60 mean, peak 7.6 GB | replay batch 1 at 9270f60e, 40 workers, 5000 of 5000 games |
| 2026-11-12 12:36 PST | gate-9270f60e-b2 | c3d-highcpu-60 | us-central1-b | 0.092 | 0.050 | exit 0 | load 51.5 of 60 mean, peak 7.6 GB | replay batch 2 at 9270f60e, 40 workers, 5000 of 5000 games |
| 2026-11-12 12:37 PST | gate-9270f60e-b3 | c3d-highcpu-60 | us-west1-a | 0.126 | 0.068 | exit 0 | load 57.9 of 60 mean, peak 7.1 GB | replay batch 3 at 9270f60e, 40 workers, 5000 of 5000 games |
| 2026-11-12 12:37 PST | gate-9270f60e-b4 | c3d-highcpu-60 | us-west1-a | 0.164 | 0.089 | exit 0 | load 75.0 of 60 mean, peak 8.5 GB | replay batch 4 at 9270f60e, 40 workers, 5000 of 5000 games |
| 2026-11-12 12:46 PST | gate-9270f60e-b7 | c3d-highcpu-60 | us-east1-c | 0.206 | 0.112 | exit 0 | load 67.9 of 60 mean, peak 11.2 GB | replay batch 7 at 9270f60e, 40 workers, 3000 of 3000 games |
| 2026-11-12 12:42 PST | gate-9270f60e-b5 | c3d-highcpu-60 | us-central1-b | 0.318 | 0.172 | exit 0 | load 66.9 of 60 mean, peak 14.1 GB | replay batch 5 at 9270f60e, 40 workers, 3000 of 3000 games |
| 2026-11-12 12:43 PST | gate-9270f60e-b6 | c3d-highcpu-60 | us-central1-b | 0.317 | 0.172 | exit 0 | load 68.5 of 60 mean, peak 14.4 GB | replay batch 6 at 9270f60e, 40 workers, 3000 of 3000 games |
| 2026-11-12 12:49 PST | gate-9270f60e-b8 | c3d-highcpu-60 | us-west1-a | 0.279 | 0.151 | exit 0 | load 69.5 of 60 mean, peak 12.2 GB | replay batch 8 at 9270f60e, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:01 PST | gate-9270f60e-b11 | c3d-highcpu-60 | us-west1-c | 0.135 | 0.073 | exit 0 | load 68.8 of 60 mean, peak 9.6 GB | replay batch 11 at 9270f60e, 40 workers, 1500 of 1500 games |
| 2026-11-12 13:07 PST | gate-9270f60e-b12 | c3d-highcpu-60 | us-east1-c | 0.097 | 0.053 | exit 0 | load 61.0 of 60 mean, peak 10.3 GB | replay batch 12 at 9270f60e, 40 workers, 1500 of 1500 games |
| 2026-11-12 13:02 PST | gate-9270f60e-b9 | c3d-highcpu-60 | us-central1-b | 0.288 | 0.156 | exit 0 | load 66.6 of 60 mean, peak 13.0 GB | replay batch 9 at 9270f60e, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:02 PST | gate-9270f60e-b10 | c3d-highcpu-60 | us-central1-b | 0.354 | 0.192 | exit 0 | load 66.9 of 60 mean, peak 15.3 GB | replay batch 10 at 9270f60e, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:20 PST | gate-9270f60e-b13 | c3d-highcpu-60 | us-central1-b | 0.092 | 0.050 | exit 0 | load 63.2 of 60 mean, peak 10.5 GB | replay batch 13 at 9270f60e, 40 workers, 1500 of 1500 games |
| 2026-11-12 13:27 PST | gate-53ba2ab4-b3 | c3d-highcpu-60 | us-central1-b | 0.093 | 0.050 | exit 0 | load 47.4 of 60 mean, peak 7.6 GB | replay batch 3 at 53ba2ab4, 40 workers, 5000 of 5000 games |
| 2026-11-12 13:27 PST | gate-53ba2ab4-b1 | c3d-highcpu-60 | us-central1-b | 0.093 | 0.050 | exit 0 | load 48.6 of 60 mean, peak 7.4 GB | replay batch 1 at 53ba2ab4, 40 workers, 5000 of 5000 games |
| 2026-11-12 13:27 PST | gate-53ba2ab4-b2 | c3d-highcpu-60 | us-east1-c | 0.096 | 0.052 | exit 0 | load 50.5 of 60 mean, peak 7.5 GB | replay batch 2 at 53ba2ab4, 40 workers, 5000 of 5000 games |
| 2026-11-12 13:27 PST | gate-53ba2ab4-b4 | c3d-highcpu-60 | us-west1-a | 0.165 | 0.089 | exit 0 | load 70.8 of 60 mean, peak 8.9 GB | replay batch 4 at 53ba2ab4, 40 workers, 5000 of 5000 games |
| 2026-11-12 13:33 PST | gate-53ba2ab4-b7 | c3d-highcpu-60 | us-central1-b | 0.202 | 0.109 | exit 0 | load 67.5 of 60 mean, peak 11.6 GB | replay batch 7 at 53ba2ab4, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:45 PST | gate-53ba2ab4-b11 | c3d-highcpu-60 | us-central1-b | 0.100 | 0.054 | exit 0 | load 62.6 of 60 mean, peak 9.4 GB | replay batch 11 at 53ba2ab4, 40 workers, 1500 of 1500 games |
| 2026-11-12 13:34 PST | gate-53ba2ab4-b6 | c3d-highcpu-60 | us-east1-c | 0.314 | 0.170 | exit 0 | load 67.8 of 60 mean, peak 13.8 GB | replay batch 6 at 53ba2ab4, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:33 PST | gate-53ba2ab4-b5 | c3d-highcpu-60 | us-central1-b | 0.352 | 0.191 | exit 0 | load 67.6 of 60 mean, peak 13.1 GB | replay batch 5 at 53ba2ab4, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:39 PST | gate-53ba2ab4-b8 | c3d-highcpu-60 | us-west1-c | 0.281 | 0.152 | exit 0 | load 69.2 of 60 mean, peak 12.9 GB | replay batch 8 at 53ba2ab4, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:57 PST | gate-53ba2ab4-b12 | c3d-highcpu-60 | us-east1-c | 0.109 | 0.059 | exit 0 | load 60.6 of 60 mean, peak 10.3 GB | replay batch 12 at 53ba2ab4, 40 workers, 1500 of 1500 games |
| 2026-11-12 13:54 PST | gate-53ba2ab4-b9 | c3d-highcpu-60 | us-central1-b | 0.297 | 0.161 | exit 0 | load 67.7 of 60 mean, peak 13.9 GB | replay batch 9 at 53ba2ab4, 40 workers, 3000 of 3000 games |
| 2026-11-12 13:53 PST | gate-53ba2ab4-b10 | c3d-highcpu-60 | us-central1-b | 0.416 | 0.225 | exit 0 | load 63.2 of 60 mean, peak 15.0 GB | replay batch 10 at 53ba2ab4, 40 workers, 3000 of 3000 games |
| 2026-11-12 14:13 PST | gate-53ba2ab4-b13 | c3d-highcpu-60 | us-central1-b | 0.139 | 0.075 | exit 0 | load 65.0 of 60 mean, peak 9.7 GB | replay batch 13 at 53ba2ab4, 40 workers, 1500 of 1500 games |
| 2026-11-12 14:25 PST | gate-388394a1-b3 | c3d-highcpu-60 | us-central1-b | 0.102 | 0.055 | exit 0 | load 49.3 of 60 mean, peak 7.6 GB | replay batch 3 at 388394a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 14:26 PST | gate-388394a1-b1 | c3d-highcpu-60 | us-east1-c | 0.099 | 0.054 | exit 0 | load 47.5 of 60 mean, peak 7.9 GB | replay batch 1 at 388394a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 14:26 PST | gate-388394a1-b2 | c3d-highcpu-60 | us-west1-a | 0.097 | 0.053 | exit 0 | load 50.9 of 60 mean, peak 7.4 GB | replay batch 2 at 388394a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 14:25 PST | gate-388394a1-b4 | c3d-highcpu-60 | us-central1-b | 0.177 | 0.096 | exit 0 | load 70.8 of 60 mean, peak 8.6 GB | replay batch 4 at 388394a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 14:31 PST | gate-388394a1-b7 | c3d-highcpu-60 | us-central1-b | 0.250 | 0.135 | exit 0 | load 71.6 of 60 mean, peak 11.8 GB | replay batch 7 at 388394a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 14:36 PST | gate-388394a1-b8 | c3d-highcpu-60 | us-central1-b | 0.291 | 0.158 | exit 0 | load 68.0 of 60 mean, peak 12.7 GB | replay batch 8 at 388394a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 14:47 PST | gate-388394a1-b11 | c3d-highcpu-60 | us-central1-b | 0.138 | 0.075 | exit 0 | load 68.3 of 60 mean, peak 10.1 GB | replay batch 11 at 388394a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 14:34 PST | gate-388394a1-b6 | c3d-highcpu-60 | us-west1-a | 0.362 | 0.196 | exit 0 | load 66.9 of 60 mean, peak 14.7 GB | replay batch 6 at 388394a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 14:33 PST | gate-388394a1-b5 | c3d-highcpu-60 | us-west1-a | 0.395 | 0.214 | exit 0 | load 65.0 of 60 mean, peak 14.9 GB | replay batch 5 at 388394a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 14:54 PST | gate-388394a1-b12 | c3d-highcpu-60 | us-central1-b | 0.132 | 0.071 | exit 0 | load 66.6 of 60 mean, peak 10.4 GB | replay batch 12 at 388394a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 14:58 PST | gate-388394a1-b9 | c3d-highcpu-60 | us-east1-c | 0.279 | 0.151 | exit 0 | load 66.6 of 60 mean, peak 12.5 GB | replay batch 9 at 388394a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 14:56 PST | gate-388394a1-b10 | c3d-highcpu-60 | us-central1-b | 0.429 | 0.232 | exit 0 | load 64.2 of 60 mean, peak 14.3 GB | replay batch 10 at 388394a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 15:16 PST | gate-388394a1-b13 | c3d-highcpu-60 | us-central1-b | 0.132 | 0.071 | exit 0 | load 73.3 of 60 mean, peak 10.6 GB | replay batch 13 at 388394a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 15:22 PST | gate-388394a1-pilots | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | script exited early | not sampled | replay batch pilots at 388394a1, 40 workers, 0 of 1367 games |
| 2026-11-12 17:29 PST | pilots-388394a1 | c3d-highcpu-60 | us-central1-b | 0.094 | 0.051 | exit 0 | load 61.1 of 60 mean, peak 10.2 GB | replay batch pilots at 388394a1, 40 workers, 1367 of 1367 games |
| 2026-11-12 17:36 PST | gate-9d692e80-b1 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 49.8 of 60 mean, peak 7.6 GB | replay batch 1 at 9d692e80, 40 workers, 5000 of 5000 games |
| 2026-11-12 17:36 PST | gate-9d692e80-b3 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 52.8 of 60 mean, peak 7.4 GB | replay batch 3 at 9d692e80, 40 workers, 5000 of 5000 games |
| 2026-11-12 17:37 PST | gate-9d692e80-b2 | c3d-highcpu-60 | us-west1-a | 0.090 | 0.049 | exit 0 | load 49.8 of 60 mean, peak 7.5 GB | replay batch 2 at 9d692e80, 40 workers, 5000 of 5000 games |
| 2026-11-12 17:36 PST | gate-9d692e80-b4 | c3d-highcpu-60 | us-east1-b | 0.161 | 0.087 | exit 0 | load 70.9 of 60 mean, peak 8.8 GB | replay batch 4 at 9d692e80, 40 workers, 5000 of 5000 games |
| 2026-11-12 17:42 PST | gate-9d692e80-b7 | c3d-highcpu-60 | us-central1-b | 0.235 | 0.127 | exit 0 | load 66.2 of 60 mean, peak 11.8 GB | replay batch 7 at 9d692e80, 40 workers, 3000 of 3000 games |
| 2026-11-12 17:42 PST | gate-9d692e80-b5 | c3d-highcpu-60 | us-central1-b | 0.342 | 0.185 | exit 0 | load 65.9 of 60 mean, peak 14.0 GB | replay batch 5 at 9d692e80, 40 workers, 3000 of 3000 games |
| 2026-11-12 17:47 PST | gate-9d692e80-b8 | c3d-highcpu-60 | us-east1-b | 0.272 | 0.147 | exit 0 | load 67.0 of 60 mean, peak 12.9 GB | replay batch 8 at 9d692e80, 40 workers, 3000 of 3000 games |
| 2026-11-12 17:43 PST | gate-9d692e80-b6 | c3d-highcpu-60 | us-west1-c | 0.344 | 0.186 | exit 0 | load 67.1 of 60 mean, peak 14.0 GB | replay batch 6 at 9d692e80, 40 workers, 3000 of 3000 games |
| 2026-11-12 17:56 PST | gate-9d692e80-b11 | c3d-highcpu-60 | us-central1-b | 0.131 | 0.071 | exit 0 | load 69.3 of 60 mean, peak 10.2 GB | replay batch 11 at 9d692e80, 40 workers, 1500 of 1500 games |
| 2026-11-12 18:04 PST | gate-9d692e80-b12 | c3d-highcpu-60 | us-east1-b | 0.131 | 0.071 | exit 0 | load 63.3 of 60 mean, peak 10.1 GB | replay batch 12 at 9d692e80, 40 workers, 1500 of 1500 games |
| 2026-11-12 18:02 PST | gate-9d692e80-b9 | c3d-highcpu-60 | us-central1-b | 0.310 | 0.168 | exit 0 | load 66.0 of 60 mean, peak 13.8 GB | replay batch 9 at 9d692e80, 40 workers, 3000 of 3000 games |
| 2026-11-12 18:04 PST | gate-9d692e80-b10 | c3d-highcpu-60 | us-central1-b | 0.383 | 0.207 | exit 0 | load 64.8 of 60 mean, peak 14.9 GB | replay batch 10 at 9d692e80, 40 workers, 3000 of 3000 games |
| 2026-11-12 18:21 PST | gate-9d692e80-b13 | c3d-highcpu-60 | us-central1-b | 0.128 | 0.069 | exit 0 | load 68.0 of 60 mean, peak 10.6 GB | replay batch 13 at 9d692e80, 40 workers, 1500 of 1500 games |
| 2026-11-12 18:28 PST | gate-9d692e80-pilots | c3d-highcpu-60 | us-central1-b | 0.129 | 0.070 | exit 0 | load 66.8 of 60 mean, peak 10.8 GB | replay batch pilots at 9d692e80, 40 workers, 1367 of 1367 games |
| 2026-11-12 18:37 PST | b14-a | c3d-highcpu-60 | us-central1-a | 0.098 | 0.053 | exit 0 | load 50.2 of 60 mean, peak 8.5 GB | record batch 14 at 388394a1, 40 workers, 750 of 750 games |
| 2026-11-12 18:37 PST | b14-b | c3d-highcpu-60 | us-central1-a | 0.099 | 0.054 | exit 0 | load 46.9 of 60 mean, peak 8.6 GB | record batch 14 at 388394a1, 40 workers, 750 of 750 games |
| 2026-11-12 18:55 PST | gate-26d075a1-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 48.9 of 60 mean, peak 7.6 GB | replay batch 2 at 26d075a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 18:56 PST | gate-26d075a1-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 49.8 of 60 mean, peak 7.2 GB | replay batch 1 at 26d075a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 18:57 PST | gate-26d075a1-b3 | c3d-highcpu-60 | us-west1-c | 0.126 | 0.068 | exit 0 | load 55.3 of 60 mean, peak 7.4 GB | replay batch 3 at 26d075a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 18:56 PST | gate-26d075a1-b4 | c3d-highcpu-60 | us-east1-b | 0.163 | 0.088 | exit 0 | load 71.1 of 60 mean, peak 8.9 GB | replay batch 4 at 26d075a1, 40 workers, 5000 of 5000 games |
| 2026-11-12 19:01 PST | gate-26d075a1-b6 | c3d-highcpu-60 | us-central1-a | 0.302 | 0.163 | exit 0 | load 67.3 of 60 mean, peak 14.6 GB | replay batch 6 at 26d075a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 19:06 PST | gate-26d075a1-b7 | c3d-highcpu-60 | us-west1-a | 0.231 | 0.125 | exit 0 | load 66.1 of 60 mean, peak 11.9 GB | replay batch 7 at 26d075a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 19:01 PST | gate-26d075a1-b5 | c3d-highcpu-60 | us-central1-a | 0.338 | 0.183 | exit 0 | load 67.6 of 60 mean, peak 13.6 GB | replay batch 5 at 26d075a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 19:07 PST | gate-26d075a1-b8 | c3d-highcpu-60 | us-east1-b | 0.310 | 0.168 | exit 0 | load 67.6 of 60 mean, peak 12.8 GB | replay batch 8 at 26d075a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 19:27 PST | gate-26d075a1-b12 | c3d-highcpu-60 | us-east1-b | 0.100 | 0.054 | exit 0 | load 59.1 of 60 mean, peak 10.4 GB | replay batch 12 at 26d075a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 19:22 PST | gate-26d075a1-b9 | c3d-highcpu-60 | us-central1-a | 0.284 | 0.154 | exit 0 | load 69.5 of 60 mean, peak 13.3 GB | replay batch 9 at 26d075a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 19:35 PST | gate-26d075a1-b11 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 60.8 of 60 mean, peak 9.6 GB | replay batch 11 at 26d075a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 19:20 PST | gate-26d075a1-b10 | c3d-highcpu-60 | us-central1-a | 0.396 | 0.214 | exit 0 | load 63.3 of 60 mean, peak 14.9 GB | replay batch 10 at 26d075a1, 40 workers, 3000 of 3000 games |
| 2026-11-12 19:39 PST | gate-26d075a1-b13 | c3d-highcpu-60 | us-central1-a | 0.138 | 0.075 | exit 0 | load 67.4 of 60 mean, peak 10.4 GB | replay batch 13 at 26d075a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 19:41 PST | gate-26d075a1-pilots | c3d-highcpu-60 | us-east1-b | 0.139 | 0.075 | exit 0 | load 64.5 of 60 mean, peak 11.0 GB | replay batch pilots at 26d075a1, 40 workers, 1367 of 1367 games |
| 2026-11-12 19:44 PST | gate-26d075a1-b14 | c3d-highcpu-60 | us-central1-a | 0.101 | 0.055 | exit 0 | load 59.4 of 60 mean, peak 10.4 GB | replay batch 14 at 26d075a1, 40 workers, 1500 of 1500 games |
| 2026-11-12 20:29 PST | gate-1dfb8107-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 52.0 of 60 mean, peak 7.8 GB | replay batch 3 at 1dfb8107, 40 workers, 5000 of 5000 games |
| 2026-11-12 20:29 PST | gate-1dfb8107-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 51.5 of 60 mean, peak 7.0 GB | replay batch 2 at 1dfb8107, 40 workers, 5000 of 5000 games |
| 2026-11-12 20:30 PST | gate-1dfb8107-b1 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 49.5 of 60 mean, peak 8.1 GB | replay batch 1 at 1dfb8107, 40 workers, 5000 of 5000 games |
| 2026-11-12 20:29 PST | gate-1dfb8107-b4 | c3d-highcpu-60 | us-east1-b | 0.124 | 0.067 | exit 0 | load 68.6 of 60 mean, peak 8.6 GB | replay batch 4 at 1dfb8107, 40 workers, 5000 of 5000 games |
| 2026-11-12 20:35 PST | gate-1dfb8107-b7 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.124 | exit 0 | load 67.3 of 60 mean, peak 11.6 GB | replay batch 7 at 1dfb8107, 40 workers, 3000 of 3000 games |
| 2026-11-12 20:35 PST | gate-1dfb8107-b6 | c3d-highcpu-60 | us-central1-a | 0.299 | 0.162 | exit 0 | load 67.6 of 60 mean, peak 16.3 GB | replay batch 6 at 1dfb8107, 40 workers, 3000 of 3000 games |
| 2026-11-12 20:49 PST | gate-1dfb8107-b11 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 56.8 of 60 mean, peak 9.5 GB | replay batch 11 at 1dfb8107, 40 workers, 1500 of 1500 games |
| 2026-11-12 20:38 PST | gate-1dfb8107-b8 | c3d-highcpu-60 | us-east1-b | 0.299 | 0.162 | exit 0 | load 67.2 of 60 mean, peak 12.5 GB | replay batch 8 at 1dfb8107, 40 workers, 3000 of 3000 games |
| 2026-11-12 20:36 PST | gate-1dfb8107-b5 | c3d-highcpu-60 | us-west1-a | 0.369 | 0.200 | exit 0 | load 66.6 of 60 mean, peak 13.9 GB | replay batch 5 at 1dfb8107, 40 workers, 3000 of 3000 games |
| 2026-11-12 20:55 PST | gate-1dfb8107-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 60.4 of 60 mean, peak 10.1 GB | replay batch pilots at 1dfb8107, 40 workers, 1346 of 1346 games |
| 2026-11-12 20:56 PST | gate-1dfb8107-b12 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 59.5 of 60 mean, peak 10.7 GB | replay batch 12 at 1dfb8107, 40 workers, 1500 of 1500 games |
| 2026-11-12 20:53 PST | gate-1dfb8107-b10 | c3d-highcpu-60 | us-central1-a | 0.369 | 0.200 | exit 0 | load 63.8 of 60 mean, peak 15.1 GB | replay batch 10 at 1dfb8107, 40 workers, 3000 of 3000 games |
| 2026-11-12 21:00 PST | gate-1dfb8107-b9 | c3d-highcpu-60 | us-west1-a | 0.265 | 0.143 | exit 0 | load 66.2 of 60 mean, peak 13.1 GB | replay batch 9 at 1dfb8107, 40 workers, 3000 of 3000 games |
| 2026-11-12 21:15 PST | gate-1dfb8107-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 58.5 of 60 mean, peak 10.9 GB | replay batch 14 at 1dfb8107, 40 workers, 1500 of 1500 games |
| 2026-11-12 21:16 PST | gate-1dfb8107-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 67.2 of 60 mean, peak 10.2 GB | replay batch 13 at 1dfb8107, 40 workers, 1500 of 1500 games |
| 2026-11-12 21:35 PST | gate-c07c80ad-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 49.6 of 60 mean, peak 7.4 GB | replay batch 3 at c07c80ad, 40 workers, 5000 of 5000 games |
| 2026-11-12 21:35 PST | gate-c07c80ad-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 51.2 of 60 mean, peak 7.6 GB | replay batch 1 at c07c80ad, 40 workers, 5000 of 5000 games |
| 2026-11-12 21:36 PST | gate-c07c80ad-b2 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 51.3 of 60 mean, peak 7.6 GB | replay batch 2 at c07c80ad, 40 workers, 5000 of 5000 games |
| 2026-11-12 21:35 PST | gate-c07c80ad-b4 | c3d-highcpu-60 | us-east1-b | 0.159 | 0.086 | exit 0 | load 69.3 of 60 mean, peak 8.9 GB | replay batch 4 at c07c80ad, 40 workers, 5000 of 5000 games |
| 2026-11-12 21:41 PST | gate-c07c80ad-b7 | c3d-highcpu-60 | us-central1-a | 0.230 | 0.124 | exit 0 | load 67.2 of 60 mean, peak 11.3 GB | replay batch 7 at c07c80ad, 40 workers, 3000 of 3000 games |
| 2026-11-12 21:55 PST | gate-c07c80ad-b11 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 59.5 of 60 mean, peak 9.5 GB | replay batch 11 at c07c80ad, 40 workers, 1500 of 1500 games |
| 2026-11-12 21:41 PST | gate-c07c80ad-b5 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.181 | exit 0 | load 66.5 of 60 mean, peak 14.5 GB | replay batch 5 at c07c80ad, 40 workers, 3000 of 3000 games |
| 2026-11-12 21:42 PST | gate-c07c80ad-b6 | c3d-highcpu-60 | us-west1-a | 0.334 | 0.181 | exit 0 | load 65.3 of 60 mean, peak 14.5 GB | replay batch 6 at c07c80ad, 40 workers, 3000 of 3000 games |
| 2026-11-12 21:46 PST | gate-c07c80ad-b8 | c3d-highcpu-60 | us-east1-b | 0.299 | 0.162 | exit 0 | load 68.3 of 60 mean, peak 13.5 GB | replay batch 8 at c07c80ad, 40 workers, 3000 of 3000 games |
| 2026-11-12 22:00 PST | gate-c07c80ad-pilots | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 66.5 of 60 mean, peak 10.4 GB | replay batch pilots at c07c80ad, 40 workers, 1346 of 1346 games |
| 2026-11-12 22:05 PST | gate-c07c80ad-b12 | c3d-highcpu-60 | us-east1-b | 0.125 | 0.068 | exit 0 | load 62.6 of 60 mean, peak 9.9 GB | replay batch 12 at c07c80ad, 40 workers, 1500 of 1500 games |
| 2026-11-12 22:01 PST | gate-c07c80ad-b9 | c3d-highcpu-60 | us-central1-a | 0.265 | 0.143 | exit 0 | load 67.1 of 60 mean, peak 13.4 GB | replay batch 9 at c07c80ad, 40 workers, 3000 of 3000 games |
| 2026-11-12 22:17 PST | gate-c07c80ad-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 66.2 of 60 mean, peak 10.7 GB | replay batch 13 at c07c80ad, 40 workers, 1500 of 1500 games |
| 2026-11-12 22:03 PST | gate-c07c80ad-b10 | c3d-highcpu-60 | us-west1-a | 0.369 | 0.200 | exit 0 | load 63.1 of 60 mean, peak 15.1 GB | replay batch 10 at c07c80ad, 40 workers, 3000 of 3000 games |
| 2026-11-12 22:26 PST | gate-c07c80ad-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 59.3 of 60 mean, peak 10.2 GB | replay batch 14 at c07c80ad, 40 workers, 1500 of 1500 games |
| 2026-11-13 00:27 PST | gate-c1dc5ee8-b3 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 51.8 of 60 mean, peak 7.4 GB | replay batch 3 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 00:27 PST | gate-c1dc5ee8-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 49.5 of 60 mean, peak 8.0 GB | replay batch 1 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 00:28 PST | gate-c1dc5ee8-b2 | c3d-highcpu-60 | us-west1-a | 0.091 | 0.049 | exit 0 | load 51.0 of 60 mean, peak 7.5 GB | replay batch 2 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 00:28 PST | gate-c1dc5ee8-b4 | c3d-highcpu-60 | us-east1-c | 0.124 | 0.067 | exit 0 | load 67.2 of 60 mean, peak 9.1 GB | replay batch 4 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 00:33 PST | gate-c1dc5ee8-b7 | c3d-highcpu-60 | us-central1-a | 0.232 | 0.126 | exit 0 | load 68.1 of 60 mean, peak 12.2 GB | replay batch 7 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 00:36 PST | gate-c1dc5ee8-b8 | c3d-highcpu-60 | us-east1-b | 0.274 | 0.148 | exit 0 | load 68.8 of 60 mean, peak 13.4 GB | replay batch 8 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 00:48 PST | gate-c1dc5ee8-b11 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 60.9 of 60 mean, peak 9.8 GB | replay batch 11 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 00:33 PST | gate-c1dc5ee8-b5 | c3d-highcpu-60 | us-central1-a | 0.341 | 0.185 | exit 0 | load 66.6 of 60 mean, peak 14.5 GB | replay batch 5 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 00:35 PST | gate-c1dc5ee8-b6 | c3d-highcpu-60 | us-west1-a | 0.306 | 0.166 | exit 0 | load 66.8 of 60 mean, peak 15.0 GB | replay batch 6 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 00:53 PST | gate-c1dc5ee8-b12 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 59.4 of 60 mean, peak 10.4 GB | replay batch 12 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 00:54 PST | gate-c1dc5ee8-pilots | c3d-highcpu-60 | us-central1-b | 0.096 | 0.052 | exit 0 | load 59.4 of 60 mean, peak 10.3 GB | replay batch pilots at c1dc5ee8, 40 workers, 1353 of 1353 games |
| 2026-11-13 00:55 PST | gate-c1dc5ee8-b9 | c3d-highcpu-60 | us-east1-b | 0.272 | 0.147 | exit 0 | load 65.8 of 60 mean, peak 13.5 GB | replay batch 9 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 00:55 PST | gate-c1dc5ee8-b10 | c3d-highcpu-60 | us-west1-a | 0.377 | 0.204 | exit 0 | load 63.4 of 60 mean, peak 14.9 GB | replay batch 10 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 01:11 PST | gate-c1dc5ee8-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 66.9 of 60 mean, peak 10.9 GB | replay batch 13 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 01:18 PST | gate-c1dc5ee8-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 64.8 of 60 mean, peak 10.6 GB | replay batch 14 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 01:26 PST | cov13-test-b1 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | not sampled | coverage batch 1 at c07c80ad, 60 workers, 50 of 50 games |
| 2026-11-13 01:27 PST | b15-b | c3d-highcpu-60 | us-central1-a | 0.056 | 0.030 | exit 0 | load 40.6 of 60 mean, peak 6.8 GB | record batch 15 at c1dc5ee8, 40 workers, 309 of 309 games |
| 2026-11-13 01:27 PST | b15-a | c3d-highcpu-60 | us-east1-b | 0.054 | 0.029 | exit 0 | not sampled | record batch 15 at c1dc5ee8, 40 workers, 309 of 309 games |
| 2026-11-13 01:31 PST | cov13-b5 | c3d-highcpu-60 | us-central1-a | 0.219 | 0.119 | exit 0 | load 54.5 of 60 mean, peak 9.2 GB | coverage batch 5 at c1dc5ee8, 60 workers, 3100 of 3000 listed games |
| 2026-11-13 01:31 PST | cov13-b9 | c3d-highcpu-60 | us-east1-b | 0.222 | 0.120 | exit 0 | load 59.4 of 60 mean, peak 9.0 GB | coverage batch 9 at c1dc5ee8, 60 workers, 3000 of 3000 listed games |
| 2026-11-13 01:32 PST | cov13-b10 | c3d-highcpu-60 | us-west1-a | 0.258 | 0.140 | exit 0 | load 62.7 of 60 mean, peak 9.9 GB | coverage batch 10 at c1dc5ee8, 60 workers, 3000 of 3000 listed games |
| 2026-11-13 01:31 PST | cov13-b6 | c3d-highcpu-60 | us-central1-a | 0.296 | 0.160 | exit 0 | load 57.6 of 60 mean, peak 9.6 GB | coverage batch 6 at c1dc5ee8, 60 workers, 2999 of 3000 listed games |
| 2026-11-13 01:47 PST | gate-d102307d-b1 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 52.9 of 60 mean, peak 7.5 GB | replay batch 1 at d102307d, 40 workers, 5000 of 5000 games |
| 2026-11-13 01:48 PST | gate-d102307d-b3 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.050 | exit 0 | load 49.2 of 60 mean, peak 7.3 GB | replay batch 3 at d102307d, 40 workers, 5000 of 5000 games |
| 2026-11-13 01:48 PST | gate-d102307d-b4 | c3d-highcpu-60 | us-west1-a | 0.130 | 0.070 | exit 0 | load 67.5 of 60 mean, peak 8.7 GB | replay batch 4 at d102307d, 40 workers, 5000 of 5000 games |
| 2026-11-13 01:55 PST | gate-d102307d-b2 | c3d-highcpu-60 | us-east1-b | 0.094 | 0.051 | exit 0 | load 49.3 of 60 mean, peak 7.9 GB | replay batch 2 at d102307d, 40 workers, 5000 of 5000 games |
| 2026-11-13 02:01 PST | gate-c1dc5ee8-b4 | c3d-highcpu-60 | us-east1-c | 0.014 | 0.008 | exit 0 | not sampled | replay batch 4 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 01:54 PST | gate-d102307d-b7 | c3d-highcpu-60 | us-central1-a | 0.237 | 0.128 | exit 0 | load 68.9 of 60 mean, peak 12.6 GB | replay batch 7 at d102307d, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:08 PST | gate-c1dc5ee8-b1 | c3d-highcpu-60 | us-west1-c | 0.019 | 0.010 | exit 0 | not sampled | replay batch 1 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 02:09 PST | gate-c1dc5ee8-b8 | c3d-highcpu-60 | us-central1-c | 0.019 | 0.010 | exit 0 | not sampled | replay batch 8 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:10 PST | gate-c1dc5ee8-b5 | c3d-highcpu-60 | us-west1-a | 0.014 | 0.008 | exit 0 | not sampled | replay batch 5 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:11 PST | gate-c1dc5ee8-b9 | c3d-highcpu-60 | us-central1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 9 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:13 PST | gate-c1dc5ee8-b13 | c3d-highcpu-60 | us-central1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 13 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 01:57 PST | gate-d102307d-b8 | c3d-highcpu-60 | us-west1-a | 0.277 | 0.150 | exit 0 | load 66.9 of 60 mean, peak 12.7 GB | replay batch 8 at d102307d, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:14 PST | gate-c1dc5ee8-b2 | c3d-highcpu-60 | us-central1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 2 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 02:15 PST | gate-c1dc5ee8-b3 | c3d-highcpu-60 | us-west1-c | 0.017 | 0.009 | exit 0 | not sampled | replay batch 3 at c1dc5ee8, 40 workers, 5000 of 5000 games |
| 2026-11-13 01:53 PST | gate-d102307d-b5 | c3d-highcpu-60 | us-central1-a | 0.382 | 0.207 | exit 0 | load 67.5 of 60 mean, peak 14.1 GB | replay batch 5 at d102307d, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:15 PST | gate-c1dc5ee8-b6 | c3d-highcpu-60 | us-central1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 6 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:16 PST | gate-c1dc5ee8-b7 | c3d-highcpu-60 | us-central1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 7 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:16 PST | gate-c1dc5ee8-b10 | c3d-highcpu-60 | us-central1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch 10 at c1dc5ee8, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:17 PST | gate-c1dc5ee8-b12 | c3d-highcpu-60 | us-central1-b | 0.017 | 0.009 | exit 0 | not sampled | replay batch 12 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:18 PST | gate-c1dc5ee8-pilots | c3d-highcpu-60 | us-central1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch pilots at c1dc5ee8, 40 workers, 1353 of 1353 games |
| 2026-11-13 02:02 PST | gate-d102307d-b6 | c3d-highcpu-60 | us-east1-c | 0.307 | 0.166 | exit 0 | load 67.9 of 60 mean, peak 13.9 GB | replay batch 6 at d102307d, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:16 PST | gate-d102307d-b11 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 65.6 of 60 mean, peak 9.9 GB | replay batch 11 at d102307d, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:24 PST | gate-c1dc5ee8-b11 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 11 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:21 PST | gate-d102307d-b12 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 62.8 of 60 mean, peak 9.9 GB | replay batch 12 at d102307d, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:26 PST | gate-c1dc5ee8-b15 | c3d-highcpu-60 | us-east1-b | 0.052 | 0.028 | exit 0 | not sampled | replay batch 15 at c1dc5ee8, 40 workers, 100 of 100 games |
| 2026-11-13 02:17 PST | gate-d102307d-b9 | c3d-highcpu-60 | us-west1-a | 0.263 | 0.142 | exit 0 | load 68.2 of 60 mean, peak 13.4 GB | replay batch 9 at d102307d, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:29 PST | gate-d102307d-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 59.1 of 60 mean, peak 10.0 GB | replay batch pilots at d102307d, 40 workers, 1353 of 1353 games |
| 2026-11-13 02:31 PST | gate-d102307d-b15 | c3d-highcpu-60 | us-east1-b | 0.054 | 0.029 | exit 0 | not sampled | replay batch 15 at d102307d, 40 workers, 100 of 100 games |
| 2026-11-13 02:38 PST | gate-c1dc5ee8-b14 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 14 at c1dc5ee8, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:34 PST | gate-d102307d-b13 | c3d-highcpu-60 | us-west1-a | 0.092 | 0.050 | exit 0 | load 63.5 of 60 mean, peak 11.3 GB | replay batch 13 at d102307d, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:20 PST | gate-d102307d-b10 | c3d-highcpu-60 | us-central1-a | 0.374 | 0.202 | exit 0 | load 63.5 of 60 mean, peak 15.3 GB | replay batch 10 at d102307d, 40 workers, 3000 of 3000 games |
| 2026-11-13 02:43 PST | gate-d102307d-b14 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.049 | exit 0 | load 59.7 of 60 mean, peak 10.4 GB | replay batch 14 at d102307d, 40 workers, 1500 of 1500 games |
| 2026-11-13 02:51 PST | gate-d102307d-b15r | c3d-highcpu-60 | us-east1-b | 0.057 | 0.031 | exit 0 | load 51.5 of 60 mean, peak 9.5 GB | replay batch 15 at d102307d, 40 workers, 618 of 618 games |
| 2026-11-13 02:49 PST | cov13-b8 | c3d-highcpu-60 | us-central1-a | 0.203 | 0.110 | exit 0 | load 56.2 of 60 mean, peak 7.8 GB | coverage batch 8 at c1dc5ee8, 60 workers, 3000 of 3000 listed games |
| 2026-11-13 02:51 PST | cov13-b7 | c3d-highcpu-60 | us-west1-a | 0.202 | 0.109 | exit 0 | load 59.6 of 60 mean, peak 7.6 GB | coverage batch 7 at c1dc5ee8, 60 workers, 3000 of 3000 listed games |
| 2026-11-13 02:49 PST | cov13-b4 | c3d-highcpu-60 | us-central1-a | 0.308 | 0.167 | exit 0 | load 58.0 of 60 mean, peak 4.8 GB | coverage batch 4 at c1dc5ee8, 60 workers, 5000 of 5000 listed games |
| 2026-11-13 03:07 PST | gate-09680837-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 47.9 of 60 mean, peak 8.0 GB | replay batch 2 at 09680837, 40 workers, 5000 of 5000 games |
| 2026-11-13 03:08 PST | gate-09680837-b1 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 47.9 of 60 mean, peak 8.4 GB | replay batch 1 at 09680837, 40 workers, 5000 of 5000 games |
| 2026-11-13 03:08 PST | gate-09680837-b3 | c3d-highcpu-60 | us-west1-c | 0.125 | 0.068 | exit 0 | load 56.2 of 60 mean, peak 7.5 GB | replay batch 3 at 09680837, 40 workers, 5000 of 5000 games |
| 2026-11-13 03:00 PST | cov13-repo | c3d-highcpu-60 | us-east1-b | 0.266 | 0.144 | exit 0 | load 58.7 of 60 mean, peak 5.6 GB | coverage batch repo at c1dc5ee8, 60 workers, 5759 of 5759 games |
| 2026-11-13 03:21 PST | gate-09680837-b4 | c3d-highcpu-60 | us-west1-a | 0.125 | 0.068 | exit 0 | load 67.4 of 60 mean, peak 8.8 GB | replay batch 4 at 09680837, 40 workers, 5000 of 5000 games |
| 2026-11-13 03:16 PST | gate-09680837-b7 | c3d-highcpu-60 | us-east1-b | 0.266 | 0.144 | exit 0 | load 68.3 of 60 mean, peak 11.4 GB | replay batch 7 at 09680837, 40 workers, 3000 of 3000 games |
| 2026-11-13 03:14 PST | gate-09680837-b5 | c3d-highcpu-60 | us-central1-a | 0.336 | 0.182 | exit 0 | load 65.2 of 60 mean, peak 14.3 GB | replay batch 5 at 09680837, 40 workers, 3000 of 3000 games |
| 2026-11-13 03:13 PST | gate-09680837-b6 | c3d-highcpu-60 | us-central1-a | 0.372 | 0.201 | exit 0 | load 68.0 of 60 mean, peak 14.1 GB | replay batch 6 at 09680837, 40 workers, 3000 of 3000 games |
| 2026-11-13 03:33 PST | gate-09680837-b11 | c3d-highcpu-60 | us-east1-b | 0.090 | 0.049 | exit 0 | load 58.6 of 60 mean, peak 9.9 GB | replay batch 11 at 09680837, 40 workers, 1500 of 1500 games |
| 2026-11-13 03:40 PST | gate-09680837-b15 | c3d-highcpu-60 | us-east1-c | 0.054 | 0.029 | exit 0 | load 46.8 of 60 mean, peak 10.5 GB | replay batch 15 at 09680837, 40 workers, 618 of 618 games |
| 2026-11-13 03:30 PST | gate-09680837-b8 | c3d-highcpu-60 | us-west1-a | 0.265 | 0.143 | exit 0 | load 67.9 of 60 mean, peak 13.1 GB | replay batch 8 at 09680837, 40 workers, 3000 of 3000 games |
| 2026-11-13 03:34 PST | gate-09680837-b9 | c3d-highcpu-60 | us-central1-a | 0.300 | 0.162 | exit 0 | load 66.9 of 60 mean, peak 13.6 GB | replay batch 9 at 09680837, 40 workers, 3000 of 3000 games |
| 2026-11-13 03:47 PST | gate-09680837-b12 | c3d-highcpu-60 | us-east1-b | 0.124 | 0.067 | exit 0 | load 65.1 of 60 mean, peak 10.1 GB | replay batch 12 at 09680837, 40 workers, 1500 of 1500 games |
| 2026-11-13 03:35 PST | gate-09680837-b10 | c3d-highcpu-60 | us-central1-a | 0.371 | 0.201 | exit 0 | load 64.4 of 60 mean, peak 16.0 GB | replay batch 10 at 09680837, 40 workers, 3000 of 3000 games |
| 2026-11-13 03:53 PST | gate-09680837-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 67.2 of 60 mean, peak 10.0 GB | replay batch 13 at 09680837, 40 workers, 1500 of 1500 games |
| 2026-11-13 03:55 PST | gate-09680837-pilots | c3d-highcpu-60 | us-east1-b | 0.088 | 0.048 | exit 0 | load 54.0 of 60 mean, peak 10.4 GB | replay batch pilots at 09680837, 40 workers, 1353 of 1353 games |
| 2026-11-13 03:58 PST | gate-09680837-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 65.8 of 60 mean, peak 10.4 GB | replay batch 14 at 09680837, 40 workers, 1500 of 1500 games |
| 2026-11-13 04:08 PST | cov13-b11 | c3d-highcpu-60 | us-east1-c | 0.125 | 0.068 | exit 3 | load 45.7 of 60 mean, peak 5.4 GB | coverage batch 11 at c1dc5ee8, 60 workers, 1313 of 1500 listed games |
| 2026-11-13 04:06 PST | cov13-b3 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.124 | exit 0 | load 55.2 of 60 mean, peak 3.7 GB | coverage batch 3 at c1dc5ee8, 60 workers, 5000 of 5000 listed games |
| 2026-11-13 04:07 PST | cov13-b1 | c3d-highcpu-60 | us-west1-a | 0.228 | 0.123 | exit 0 | load 57.8 of 60 mean, peak 3.7 GB | coverage batch 1 at c1dc5ee8, 60 workers, 5000 of 5000 listed games |
| 2026-11-13 04:16 PST | cov13-pilots | c3d-highcpu-60 | us-east1-b | 0.125 | 0.068 | exit 0 | load 52.8 of 60 mean, peak 6.5 GB | coverage batch pilots at c1dc5ee8, 60 workers, 1353 of 1353 listed games |
| 2026-11-13 04:06 PST | cov13-b2 | c3d-highcpu-60 | us-central1-a | 0.336 | 0.182 | exit 0 | load 57.5 of 60 mean, peak 3.6 GB | coverage batch 2 at c1dc5ee8, 60 workers, 5000 of 5000 listed games |
| 2026-11-13 04:20 PST | cov13-b14 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 59.3 of 60 mean, peak 6.0 GB | coverage batch 14 at c1dc5ee8, 60 workers, 1500 of 1500 listed games |
| 2026-11-13 04:22 PST | cov13-b12 | c3d-highcpu-60 | us-west1-a | 0.123 | 0.067 | exit 0 | load 57.2 of 60 mean, peak 6.0 GB | coverage batch 12 at c1dc5ee8, 60 workers, 1500 of 1500 listed games |
| 2026-11-13 04:26 PST | cov13-b13 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.069 | exit 0 | load 54.4 of 60 mean, peak 6.5 GB | coverage batch 13 at c1dc5ee8, 60 workers, 1500 of 1500 listed games |
| 2026-11-13 04:37 PST | cov13-b11rest | c3d-highcpu-60 | us-central1-a | 0.130 | 0.070 | exit 0 | not sampled | coverage batch 11 at c1dc5ee8, 60 workers, 187 of 187 games |
| 2026-11-13 04:35 PST | cov13-b5g | c3d-highcpu-60 | us-central1-a | 0.207 | 0.112 | exit 0 | load 58.0 of 60 mean, peak 9.0 GB | coverage batch 5 at c1dc5ee8, 60 workers, 3000 of 3000 listed games |
| 2026-11-13 08:07 PST | b16-lua | c3d-highcpu-60 | us-central1-a | 0.055 | 0.030 | exit 0 | not sampled | record batch 16 at 09680837, 40 workers, 106 of 106 games |
| 2026-11-13 08:13 PST | gate-8b1ac72a-b3 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.052 | exit 0 | load 50.2 of 60 mean, peak 7.4 GB | replay batch 3 at 8b1ac72a, 40 workers, 5000 of 5000 games |
| 2026-11-13 08:13 PST | gate-8b1ac72a-b2 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.052 | exit 0 | load 49.9 of 60 mean, peak 7.3 GB | replay batch 2 at 8b1ac72a, 40 workers, 5000 of 5000 games |
| 2026-11-13 08:14 PST | gate-8b1ac72a-b1 | c3d-highcpu-60 | us-west1-a | 0.098 | 0.053 | exit 0 | load 52.8 of 60 mean, peak 7.4 GB | replay batch 1 at 8b1ac72a, 40 workers, 5000 of 5000 games |
| 2026-11-13 08:14 PST | gate-8b1ac72a-b4 | c3d-highcpu-60 | us-east1-c | 0.133 | 0.072 | exit 0 | load 66.9 of 60 mean, peak 8.9 GB | replay batch 4 at 8b1ac72a, 40 workers, 5000 of 5000 games |
| 2026-11-13 08:20 PST | gate-8b1ac72a-b7 | c3d-highcpu-60 | us-central1-a | 0.216 | 0.117 | exit 0 | load 67.0 of 60 mean, peak 11.8 GB | replay batch 7 at 8b1ac72a, 40 workers, 3000 of 3000 games |
| 2026-11-13 08:34 PST | gate-8b1ac72a-b11 | c3d-highcpu-60 | us-central1-a | 0.105 | 0.057 | exit 0 | load 60.3 of 60 mean, peak 9.9 GB | replay batch 11 at 8b1ac72a, 40 workers, 1500 of 1500 games |
| 2026-11-13 08:20 PST | gate-8b1ac72a-b6 | c3d-highcpu-60 | us-central1-a | 0.333 | 0.180 | exit 0 | load 67.6 of 60 mean, peak 13.9 GB | replay batch 6 at 8b1ac72a, 40 workers, 3000 of 3000 games |
| 2026-11-13 08:24 PST | gate-8b1ac72a-b8 | c3d-highcpu-60 | us-east1-c | 0.293 | 0.159 | exit 0 | load 66.8 of 60 mean, peak 13.1 GB | replay batch 8 at 8b1ac72a, 40 workers, 3000 of 3000 games |
| 2026-11-13 08:22 PST | gate-8b1ac72a-b5 | c3d-highcpu-60 | us-west1-a | 0.417 | 0.226 | exit 0 | load 67.2 of 60 mean, peak 13.6 GB | replay batch 5 at 8b1ac72a, 40 workers, 3000 of 3000 games |
| 2026-11-13 08:41 PST | gate-8b1ac72a-b15 | c3d-highcpu-60 | us-central1-a | 0.117 | 0.063 | exit 0 | load 47.3 of 60 mean, peak 10.1 GB | replay batch 15 at 8b1ac72a, 40 workers, 618 of 618 games |
| 2026-11-13 08:44 PST | gate-8b1ac72a-b12 | c3d-highcpu-60 | us-east1-c | 0.108 | 0.058 | exit 0 | load 59.0 of 60 mean, peak 10.2 GB | replay batch 12 at 8b1ac72a, 40 workers, 1500 of 1500 games |
| 2026-11-13 08:52 PST | gate-8b1ac72a-b16 | c3d-highcpu-60 | us-east1-c | 0.066 | 0.036 | exit 0 | not sampled | replay batch 16 at 8b1ac72a, 40 workers, 106 of 106 games |
| 2026-11-13 08:48 PST | gate-8b1ac72a-b9 | c3d-highcpu-60 | us-central1-a | 0.308 | 0.167 | exit 0 | load 67.3 of 60 mean, peak 13.2 GB | replay batch 9 at 8b1ac72a, 40 workers, 3000 of 3000 games |
| 2026-11-13 08:41 PST | gate-8b1ac72a-b10 | c3d-highcpu-60 | us-central1-a | 0.471 | 0.255 | exit 0 | load 65.6 of 60 mean, peak 14.6 GB | replay batch 10 at 8b1ac72a, 40 workers, 3000 of 3000 games |
| 2026-11-13 09:08 PST | gate-8b1ac72a-b13 | c3d-highcpu-60 | us-central1-a | 0.108 | 0.058 | exit 0 | load 64.1 of 60 mean, peak 10.8 GB | replay batch 13 at 8b1ac72a, 40 workers, 1500 of 1500 games |
| 2026-11-13 09:10 PST | gate-8b1ac72a-b14 | c3d-highcpu-60 | us-central1-a | 0.104 | 0.056 | exit 0 | load 60.0 of 60 mean, peak 10.2 GB | replay batch 14 at 8b1ac72a, 40 workers, 1500 of 1500 games |
| 2026-11-13 09:15 PST | gate-8b1ac72a-pilots | c3d-highcpu-60 | us-central1-a | 0.100 | 0.054 | exit 0 | load 59.8 of 60 mean, peak 10.5 GB | replay batch pilots at 8b1ac72a, 40 workers, 1353 of 1353 games |
| 2026-11-13 09:25 PST | gate-538301c8-b1 | c3d-highcpu-60 | us-central1-a | 0.098 | 0.053 | exit 0 | load 47.9 of 60 mean, peak 7.9 GB | replay batch 1 at 538301c8, 40 workers, 5000 of 5000 games |
| 2026-11-13 09:25 PST | gate-538301c8-b3 | c3d-highcpu-60 | us-central1-a | 0.100 | 0.054 | exit 0 | load 53.3 of 60 mean, peak 6.9 GB | replay batch 3 at 538301c8, 40 workers, 5000 of 5000 games |
| 2026-11-13 09:26 PST | gate-538301c8-b2 | c3d-highcpu-60 | us-west1-a | 0.102 | 0.055 | exit 0 | load 49.5 of 60 mean, peak 7.6 GB | replay batch 2 at 538301c8, 40 workers, 5000 of 5000 games |
| 2026-11-13 09:26 PST | gate-538301c8-b4 | c3d-highcpu-60 | us-east1-c | 0.140 | 0.076 | exit 0 | load 67.3 of 60 mean, peak 9.0 GB | replay batch 4 at 538301c8, 40 workers, 5000 of 5000 games |
| 2026-11-13 09:32 PST | gate-538301c8-b7 | c3d-highcpu-60 | us-central1-a | 0.241 | 0.130 | exit 0 | load 67.7 of 60 mean, peak 11.6 GB | replay batch 7 at 538301c8, 40 workers, 3000 of 3000 games |
| 2026-11-13 09:35 PST | gate-538301c8-b8 | c3d-highcpu-60 | us-east1-c | 0.278 | 0.150 | exit 0 | load 67.9 of 60 mean, peak 12.8 GB | replay batch 8 at 538301c8, 40 workers, 3000 of 3000 games |
| 2026-11-13 09:47 PST | gate-538301c8-b11 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.051 | exit 0 | load 61.2 of 60 mean, peak 9.7 GB | replay batch 11 at 538301c8, 40 workers, 1500 of 1500 games |
| 2026-11-13 09:34 PST | gate-538301c8-b6 | c3d-highcpu-60 | us-west1-a | 0.316 | 0.171 | exit 0 | load 68.1 of 60 mean, peak 12.5 GB | replay batch 6 at 538301c8, 40 workers, 3000 of 3000 games |
| 2026-11-13 09:32 PST | gate-538301c8-b5 | c3d-highcpu-60 | us-central1-a | 0.389 | 0.211 | exit 0 | load 66.3 of 60 mean, peak 15.0 GB | replay batch 5 at 538301c8, 40 workers, 3000 of 3000 games |
| 2026-11-13 09:54 PST | gate-538301c8-b15 | c3d-highcpu-60 | us-east1-c | 0.057 | 0.031 | exit 0 | load 46.6 of 60 mean, peak 10.1 GB | replay batch 15 at 538301c8, 40 workers, 618 of 618 games |
| 2026-11-13 09:53 PST | gate-538301c8-b12 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.051 | exit 0 | load 59.8 of 60 mean, peak 9.8 GB | replay batch 12 at 538301c8, 40 workers, 1500 of 1500 games |
| 2026-11-13 09:59 PST | gate-538301c8-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at 538301c8, 40 workers, 106 of 106 games |
| 2026-11-13 09:55 PST | gate-538301c8-b9 | c3d-highcpu-60 | us-central1-a | 0.312 | 0.169 | exit 0 | load 67.3 of 60 mean, peak 13.2 GB | replay batch 9 at 538301c8, 40 workers, 3000 of 3000 games |
| 2026-11-13 09:55 PST | gate-538301c8-b10 | c3d-highcpu-60 | us-west1-a | 0.418 | 0.226 | exit 0 | load 63.6 of 60 mean, peak 14.5 GB | replay batch 10 at 538301c8, 40 workers, 3000 of 3000 games |
| 2026-11-13 10:15 PST | gate-538301c8-b13 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.070 | exit 0 | load 65.9 of 60 mean, peak 10.4 GB | replay batch 13 at 538301c8, 40 workers, 1500 of 1500 games |
| 2026-11-13 10:20 PST | gate-538301c8-b14 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.068 | exit 0 | load 64.4 of 60 mean, peak 10.5 GB | replay batch 14 at 538301c8, 40 workers, 1500 of 1500 games |
| 2026-11-13 10:23 PST | gate-538301c8-pilots | c3d-highcpu-60 | us-central1-a | 0.128 | 0.069 | exit 0 | load 67.1 of 60 mean, peak 10.8 GB | replay batch pilots at 538301c8, 40 workers, 1353 of 1353 games |
| 2026-11-13 10:34 PST | gate-6bd487fa-b3 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.049 | exit 0 | load 47.7 of 60 mean, peak 7.8 GB | replay batch 3 at 6bd487fa, 40 workers, 5000 of 5000 games |
| 2026-11-13 10:34 PST | gate-6bd487fa-b1 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.049 | exit 0 | load 49.8 of 60 mean, peak 7.3 GB | replay batch 1 at 6bd487fa, 40 workers, 5000 of 5000 games |
| 2026-11-13 10:35 PST | gate-6bd487fa-b2 | c3d-highcpu-60 | us-west1-a | 0.091 | 0.049 | exit 0 | load 52.7 of 60 mean, peak 7.9 GB | replay batch 2 at 6bd487fa, 40 workers, 5000 of 5000 games |
| 2026-11-13 10:33 PST | gate-6bd487fa-b4 | c3d-highcpu-60 | us-central1-a | 0.161 | 0.087 | exit 0 | load 67.3 of 60 mean, peak 8.5 GB | replay batch 4 at 6bd487fa, 40 workers, 5000 of 5000 games |
| 2026-11-13 10:39 PST | gate-6bd487fa-b7 | c3d-highcpu-60 | us-central1-a | 0.230 | 0.124 | exit 0 | load 68.3 of 60 mean, peak 13.0 GB | replay batch 7 at 6bd487fa, 40 workers, 3000 of 3000 games |
| 2026-11-13 10:43 PST | gate-6bd487fa-b8 | c3d-highcpu-60 | us-central1-a | 0.268 | 0.145 | exit 0 | load 68.6 of 60 mean, peak 13.5 GB | replay batch 8 at 6bd487fa, 40 workers, 3000 of 3000 games |
| 2026-11-13 10:54 PST | gate-6bd487fa-b11 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 62.3 of 60 mean, peak 10.2 GB | replay batch 11 at 6bd487fa, 40 workers, 1500 of 1500 games |
| 2026-11-13 10:40 PST | gate-6bd487fa-b5 | c3d-highcpu-60 | us-east1-c | 0.340 | 0.184 | exit 0 | load 67.0 of 60 mean, peak 14.8 GB | replay batch 5 at 6bd487fa, 40 workers, 3000 of 3000 games |
| 2026-11-13 11:00 PST | gate-6bd487fa-b15 | c3d-highcpu-60 | us-central1-a | 0.055 | 0.030 | exit 0 | load 47.0 of 60 mean, peak 10.4 GB | replay batch 15 at 6bd487fa, 40 workers, 618 of 618 games |
| 2026-11-13 10:41 PST | gate-6bd487fa-b6 | c3d-highcpu-60 | us-west1-a | 0.377 | 0.204 | exit 0 | load 68.2 of 60 mean, peak 14.7 GB | replay batch 6 at 6bd487fa, 40 workers, 3000 of 3000 games |
| 2026-11-13 10:59 PST | gate-6bd487fa-b12 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 61.3 of 60 mean, peak 10.2 GB | replay batch 12 at 6bd487fa, 40 workers, 1500 of 1500 games |
| 2026-11-13 11:05 PST | gate-6bd487fa-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at 6bd487fa, 40 workers, 106 of 106 games |
| 2026-11-13 11:02 PST | gate-6bd487fa-b9 | c3d-highcpu-60 | us-east1-c | 0.268 | 0.145 | exit 0 | load 67.1 of 60 mean, peak 13.1 GB | replay batch 9 at 6bd487fa, 40 workers, 3000 of 3000 games |
| 2026-11-13 11:18 PST | gate-6bd487fa-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 65.1 of 60 mean, peak 10.9 GB | replay batch 13 at 6bd487fa, 40 workers, 1500 of 1500 games |
| 2026-11-13 11:05 PST | gate-6bd487fa-b10 | c3d-highcpu-60 | us-central1-a | 0.408 | 0.221 | exit 0 | load 64.8 of 60 mean, peak 14.8 GB | replay batch 10 at 6bd487fa, 40 workers, 3000 of 3000 games |
| 2026-11-13 11:26 PST | gate-6bd487fa-pilots | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 60.6 of 60 mean, peak 10.5 GB | replay batch pilots at 6bd487fa, 40 workers, 1353 of 1353 games |
| 2026-11-13 11:29 PST | gate-6bd487fa-b14 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 57.2 of 60 mean, peak 10.6 GB | replay batch 14 at 6bd487fa, 40 workers, 1500 of 1500 games |
| 2026-11-13 11:42 PST | gate-2f76d8c0-b2 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.049 | exit 0 | load 51.3 of 60 mean, peak 7.5 GB | replay batch 2 at 2f76d8c0, 40 workers, 5000 of 5000 games |
| 2026-11-13 11:43 PST | gate-2f76d8c0-b1 | c3d-highcpu-60 | us-west1-a | 0.094 | 0.051 | exit 0 | load 49.6 of 60 mean, peak 7.5 GB | replay batch 1 at 2f76d8c0, 40 workers, 5000 of 5000 games |
| 2026-11-13 11:43 PST | gate-2f76d8c0-b3 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 51.0 of 60 mean, peak 7.7 GB | replay batch 3 at 2f76d8c0, 40 workers, 5000 of 5000 games |
| 2026-11-13 11:43 PST | gate-2f76d8c0-b4 | c3d-highcpu-60 | us-west1-a | 0.127 | 0.069 | exit 0 | load 68.6 of 60 mean, peak 8.7 GB | replay batch 4 at 2f76d8c0, 40 workers, 5000 of 5000 games |
| 2026-11-13 11:50 PST | gate-2f76d8c0-b7 | c3d-highcpu-60 | us-east1-c | 0.236 | 0.128 | exit 0 | load 73.3 of 60 mean, peak 12.0 GB | replay batch 7 at 2f76d8c0, 40 workers, 3000 of 3000 games |
| 2026-11-13 11:52 PST | gate-2f76d8c0-b8 | c3d-highcpu-60 | us-west1-a | 0.268 | 0.145 | exit 0 | load 68.7 of 60 mean, peak 13.1 GB | replay batch 8 at 2f76d8c0, 40 workers, 3000 of 3000 games |
| 2026-11-13 11:48 PST | gate-2f76d8c0-b6 | c3d-highcpu-60 | us-central1-a | 0.341 | 0.185 | exit 0 | load 66.3 of 60 mean, peak 14.2 GB | replay batch 6 at 2f76d8c0, 40 workers, 3000 of 3000 games |
| 2026-11-13 12:05 PST | gate-2f76d8c0-b11 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.048 | exit 0 | load 58.8 of 60 mean, peak 10.1 GB | replay batch 11 at 2f76d8c0, 40 workers, 1500 of 1500 games |
| 2026-11-13 11:50 PST | gate-2f76d8c0-b5 | c3d-highcpu-60 | us-central1-a | 0.381 | 0.206 | exit 0 | load 66.8 of 60 mean, peak 14.4 GB | replay batch 5 at 2f76d8c0, 40 workers, 3000 of 3000 games |
| 2026-11-13 12:12 PST | gate-2f76d8c0-b15 | c3d-highcpu-60 | us-west1-c | 0.057 | 0.031 | exit 0 | load 47.4 of 60 mean, peak 10.0 GB | replay batch 15 at 2f76d8c0, 40 workers, 618 of 618 games |
| 2026-11-13 12:09 PST | gate-2f76d8c0-b12 | c3d-highcpu-60 | us-central1-f | 0.130 | 0.070 | exit 0 | load 62.6 of 60 mean, peak 10.6 GB | replay batch 12 at 2f76d8c0, 40 workers, 1500 of 1500 games |
| 2026-11-13 12:17 PST | gate-2f76d8c0-b16 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.052 | exit 0 | not sampled | replay batch 16 at 2f76d8c0, 40 workers, 106 of 106 games |
| 2026-11-13 12:13 PST | gate-2f76d8c0-b9 | c3d-highcpu-60 | us-central1-a | 0.278 | 0.150 | exit 0 | load 67.1 of 60 mean, peak 13.4 GB | replay batch 9 at 2f76d8c0, 40 workers, 3000 of 3000 games |
| 2026-11-13 12:10 PST | gate-2f76d8c0-b10 | c3d-highcpu-60 | us-west1-a | 0.383 | 0.207 | exit 0 | load 64.6 of 60 mean, peak 15.2 GB | replay batch 10 at 2f76d8c0, 40 workers, 3000 of 3000 games |
| 2026-11-13 12:30 PST | gate-2f76d8c0-b13 | c3d-highcpu-60 | us-central1-a | 0.131 | 0.071 | exit 0 | load 66.0 of 60 mean, peak 10.1 GB | replay batch 13 at 2f76d8c0, 40 workers, 1500 of 1500 games |
| 2026-11-13 12:34 PST | gate-2f76d8c0-b14 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.070 | exit 0 | load 62.7 of 60 mean, peak 10.2 GB | replay batch 14 at 2f76d8c0, 40 workers, 1500 of 1500 games |
| 2026-11-13 12:39 PST | gate-2f76d8c0-pilots | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 61.1 of 60 mean, peak 10.3 GB | replay batch pilots at 2f76d8c0, 40 workers, 1353 of 1353 games |
| 2026-11-13 13:30 PST | gate-fbbbf7d4-b1 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 50.2 of 60 mean, peak 7.3 GB | replay batch 1 at fbbbf7d4, 40 workers, 5000 of 5000 games |
| 2026-11-13 13:30 PST | gate-fbbbf7d4-b3 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 53.7 of 60 mean, peak 7.5 GB | replay batch 3 at fbbbf7d4, 40 workers, 5000 of 5000 games |
| 2026-11-13 13:30 PST | gate-fbbbf7d4-b2 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.050 | exit 0 | load 47.1 of 60 mean, peak 7.4 GB | replay batch 2 at fbbbf7d4, 40 workers, 5000 of 5000 games |
| 2026-11-13 13:30 PST | gate-fbbbf7d4-b4 | c3d-highcpu-60 | us-west1-a | 0.166 | 0.090 | exit 0 | load 70.5 of 60 mean, peak 9.2 GB | replay batch 4 at fbbbf7d4, 40 workers, 5000 of 5000 games |
| 2026-11-13 13:36 PST | gate-fbbbf7d4-b7 | c3d-highcpu-60 | us-central1-b | 0.237 | 0.128 | exit 0 | load 69.1 of 60 mean, peak 11.5 GB | replay batch 7 at fbbbf7d4, 40 workers, 3000 of 3000 games |
| 2026-11-13 13:51 PST | gate-fbbbf7d4-b11 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 60.8 of 60 mean, peak 9.6 GB | replay batch 11 at fbbbf7d4, 40 workers, 1500 of 1500 games |
| 2026-11-13 13:37 PST | gate-fbbbf7d4-b6 | c3d-highcpu-60 | us-west1-c | 0.341 | 0.185 | exit 0 | load 68.0 of 60 mean, peak 14.5 GB | replay batch 6 at fbbbf7d4, 40 workers, 3000 of 3000 games |
| 2026-11-13 13:42 PST | gate-fbbbf7d4-b8 | c3d-highcpu-60 | us-west1-c | 0.269 | 0.146 | exit 0 | load 67.9 of 60 mean, peak 13.3 GB | replay batch 8 at fbbbf7d4, 40 workers, 3000 of 3000 games |
| 2026-11-13 13:36 PST | gate-fbbbf7d4-b5 | c3d-highcpu-60 | us-central1-a | 0.377 | 0.204 | exit 0 | load 67.0 of 60 mean, peak 15.2 GB | replay batch 5 at fbbbf7d4, 40 workers, 3000 of 3000 games |
| 2026-11-13 13:57 PST | gate-fbbbf7d4-b15 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.047 | exit 0 | load 44.2 of 60 mean, peak 10.3 GB | replay batch 15 at fbbbf7d4, 40 workers, 618 of 618 games |
| 2026-11-13 13:59 PST | gate-fbbbf7d4-b12 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 60.3 of 60 mean, peak 10.8 GB | replay batch 12 at fbbbf7d4, 40 workers, 1500 of 1500 games |
| 2026-11-13 14:05 PST | gate-fbbbf7d4-b16 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at fbbbf7d4, 40 workers, 106 of 106 games |
| 2026-11-13 13:59 PST | gate-fbbbf7d4-b9 | c3d-highcpu-60 | us-west1-a | 0.268 | 0.145 | exit 0 | load 66.9 of 60 mean, peak 13.3 GB | replay batch 9 at fbbbf7d4, 40 workers, 3000 of 3000 games |
| 2026-11-13 13:58 PST | gate-fbbbf7d4-b10 | c3d-highcpu-60 | us-central1-f | 0.341 | 0.185 | exit 0 | load 63.3 of 60 mean, peak 15.3 GB | replay batch 10 at fbbbf7d4, 40 workers, 3000 of 3000 games |
| 2026-11-13 14:16 PST | gate-fbbbf7d4-b13 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.070 | exit 0 | load 71.7 of 60 mean, peak 11.0 GB | replay batch 13 at fbbbf7d4, 40 workers, 1500 of 1500 games |
| 2026-11-13 14:19 PST | gate-fbbbf7d4-b14 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.049 | exit 0 | load 60.6 of 60 mean, peak 10.9 GB | replay batch 14 at fbbbf7d4, 40 workers, 1500 of 1500 games |
| 2026-11-13 14:24 PST | gate-fbbbf7d4-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 61.4 of 60 mean, peak 10.1 GB | replay batch pilots at fbbbf7d4, 40 workers, 1353 of 1353 games |
| 2026-11-13 14:31 PST | gate-9b518185-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 50.1 of 60 mean, peak 7.9 GB | replay batch 1 at 9b518185, 40 workers, 5000 of 5000 games |
| 2026-11-13 14:31 PST | gate-9b518185-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 49.4 of 60 mean, peak 7.5 GB | replay batch 3 at 9b518185, 40 workers, 5000 of 5000 games |
| 2026-11-13 14:32 PST | gate-9b518185-b2 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 50.1 of 60 mean, peak 7.5 GB | replay batch 2 at 9b518185, 40 workers, 5000 of 5000 games |
| 2026-11-13 14:31 PST | gate-9b518185-b4 | c3d-highcpu-60 | us-east1-c | 0.124 | 0.067 | exit 0 | load 67.2 of 60 mean, peak 9.2 GB | replay batch 4 at 9b518185, 40 workers, 5000 of 5000 games |
| 2026-11-13 14:36 PST | gate-9b518185-b7 | c3d-highcpu-60 | us-central1-a | 0.231 | 0.125 | exit 0 | load 70.2 of 60 mean, peak 12.3 GB | replay batch 7 at 9b518185, 40 workers, 3000 of 3000 games |
| 2026-11-13 14:40 PST | gate-9b518185-b8 | c3d-highcpu-60 | us-east1-c | 0.269 | 0.146 | exit 0 | load 67.6 of 60 mean, peak 13.5 GB | replay batch 8 at 9b518185, 40 workers, 3000 of 3000 games |
| 2026-11-13 14:51 PST | gate-9b518185-b11 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 60.5 of 60 mean, peak 9.9 GB | replay batch 11 at 9b518185, 40 workers, 1500 of 1500 games |
| 2026-11-13 14:38 PST | gate-9b518185-b6 | c3d-highcpu-60 | us-west1-c | 0.340 | 0.184 | exit 0 | load 67.3 of 60 mean, peak 13.6 GB | replay batch 6 at 9b518185, 40 workers, 3000 of 3000 games |
| 2026-11-13 14:57 PST | gate-9b518185-b15 | c3d-highcpu-60 | us-east1-c | 0.058 | 0.031 | exit 0 | load 46.9 of 60 mean, peak 9.9 GB | replay batch 15 at 9b518185, 40 workers, 618 of 618 games |
| 2026-11-13 14:36 PST | gate-9b518185-b5 | c3d-highcpu-60 | us-central1-a | 0.412 | 0.223 | exit 0 | load 66.2 of 60 mean, peak 14.6 GB | replay batch 5 at 9b518185, 40 workers, 3000 of 3000 games |
| 2026-11-13 14:56 PST | gate-9b518185-b12 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 60.1 of 60 mean, peak 9.9 GB | replay batch 12 at 9b518185, 40 workers, 1500 of 1500 games |
| 2026-11-13 15:02 PST | gate-9b518185-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at 9b518185, 40 workers, 106 of 106 games |
| 2026-11-13 15:02 PST | gate-9b518185-b9 | c3d-highcpu-60 | us-central1-a | 0.265 | 0.143 | exit 0 | load 67.4 of 60 mean, peak 12.7 GB | replay batch 9 at 9b518185, 40 workers, 3000 of 3000 games |
| 2026-11-13 15:18 PST | gate-9b518185-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 64.9 of 60 mean, peak 10.5 GB | replay batch 13 at 9b518185, 40 workers, 1500 of 1500 games |
| 2026-11-13 15:00 PST | gate-9b518185-b10 | c3d-highcpu-60 | us-west1-a | 0.439 | 0.238 | exit 0 | load 62.8 of 60 mean, peak 15.3 GB | replay batch 10 at 9b518185, 40 workers, 3000 of 3000 games |
| 2026-11-13 15:27 PST | gate-9b518185-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 60.9 of 60 mean, peak 10.3 GB | replay batch 14 at 9b518185, 40 workers, 1500 of 1500 games |
| 2026-11-13 15:26 PST | gate-9b518185-pilots | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 63.7 of 60 mean, peak 11.2 GB | replay batch pilots at 9b518185, 40 workers, 1353 of 1353 games |
| 2026-11-13 17:24 PST | gate-0e37f140-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 47.9 of 60 mean, peak 7.6 GB | replay batch 2 at 0e37f140, 40 workers, 5000 of 5000 games |
| 2026-11-13 17:25 PST | gate-0e37f140-b3 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.048 | exit 0 | load 51.3 of 60 mean, peak 7.6 GB | replay batch 3 at 0e37f140, 40 workers, 5000 of 5000 games |
| 2026-11-13 17:25 PST | gate-0e37f140-b1 | c3d-highcpu-60 | us-west1-c | 0.088 | 0.048 | exit 0 | load 50.7 of 60 mean, peak 7.6 GB | replay batch 1 at 0e37f140, 40 workers, 5000 of 5000 games |
| 2026-11-13 17:24 PST | gate-0e37f140-b4 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 67.6 of 60 mean, peak 9.1 GB | replay batch 4 at 0e37f140, 40 workers, 5000 of 5000 games |
| 2026-11-13 17:31 PST | gate-0e37f140-b7 | c3d-highcpu-60 | us-east1-c | 0.228 | 0.123 | exit 0 | load 68.3 of 60 mean, peak 11.6 GB | replay batch 7 at 0e37f140, 40 workers, 3000 of 3000 games |
| 2026-11-13 17:32 PST | gate-0e37f140-b8 | c3d-highcpu-60 | us-central1-a | 0.264 | 0.143 | exit 0 | load 68.4 of 60 mean, peak 14.3 GB | replay batch 8 at 0e37f140, 40 workers, 3000 of 3000 games |
| 2026-11-13 17:30 PST | gate-0e37f140-b6 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.181 | exit 0 | load 68.7 of 60 mean, peak 14.8 GB | replay batch 6 at 0e37f140, 40 workers, 3000 of 3000 games |
| 2026-11-13 17:32 PST | gate-0e37f140-b5 | c3d-highcpu-60 | us-west1-c | 0.334 | 0.181 | exit 0 | load 68.0 of 60 mean, peak 14.3 GB | replay batch 5 at 0e37f140, 40 workers, 3000 of 3000 games |
| 2026-11-13 17:46 PST | gate-0e37f140-b11 | c3d-highcpu-60 | us-east1-b | 0.124 | 0.067 | exit 0 | load 64.4 of 60 mean, peak 9.9 GB | replay batch 11 at 0e37f140, 40 workers, 1500 of 1500 games |
| 2026-11-13 17:48 PST | gate-0e37f140-b12 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 65.9 of 60 mean, peak 10.8 GB | replay batch 12 at 0e37f140, 40 workers, 1500 of 1500 games |
| 2026-11-13 17:54 PST | gate-0e37f140-b15 | c3d-highcpu-60 | us-west1-a | 0.054 | 0.029 | exit 0 | load 48.3 of 60 mean, peak 10.1 GB | replay batch 15 at 0e37f140, 40 workers, 618 of 618 games |
| 2026-11-13 17:56 PST | gate-0e37f140-b16 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 0e37f140, 40 workers, 106 of 106 games |
| 2026-11-13 17:53 PST | gate-0e37f140-b9 | c3d-highcpu-60 | us-east1-b | 0.299 | 0.162 | exit 0 | load 67.9 of 60 mean, peak 13.3 GB | replay batch 9 at 0e37f140, 40 workers, 3000 of 3000 games |
| 2026-11-13 17:50 PST | gate-0e37f140-b10 | c3d-highcpu-60 | us-central1-a | 0.404 | 0.219 | exit 0 | load 63.6 of 60 mean, peak 15.0 GB | replay batch 10 at 0e37f140, 40 workers, 3000 of 3000 games |
| 2026-11-13 18:11 PST | gate-0e37f140-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.9 of 60 mean, peak 10.3 GB | replay batch 13 at 0e37f140, 40 workers, 1500 of 1500 games |
| 2026-11-13 18:15 PST | gate-0e37f140-b14 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 62.3 of 60 mean, peak 10.5 GB | replay batch 14 at 0e37f140, 40 workers, 1500 of 1500 games |
| 2026-11-13 18:19 PST | gate-0e37f140-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 60.6 of 60 mean, peak 10.7 GB | replay batch pilots at 0e37f140, 40 workers, 1353 of 1353 games |
| 2026-11-13 22:15 PST | gate-1799206c-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 51.6 of 60 mean, peak 7.5 GB | replay batch 1 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-13 22:16 PST | gate-1799206c-b2 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 49.2 of 60 mean, peak 7.4 GB | replay batch 2 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-13 22:16 PST | gate-1799206c-b3 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 49.3 of 60 mean, peak 8.0 GB | replay batch 3 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-13 22:15 PST | gate-1799206c-b4 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 66.1 of 60 mean, peak 9.1 GB | replay batch 4 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-13 22:22 PST | gate-1799206c-b7 | c3d-highcpu-60 | us-west1-a | 0.229 | 0.124 | exit 0 | load 68.0 of 60 mean, peak 11.7 GB | replay batch 7 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-13 22:23 PST | gate-1799206c-b8 | c3d-highcpu-60 | us-central1-a | 0.263 | 0.142 | exit 0 | load 67.4 of 60 mean, peak 12.9 GB | replay batch 8 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-13 22:22 PST | gate-1799206c-b6 | c3d-highcpu-60 | us-east1-c | 0.334 | 0.181 | exit 0 | load 67.4 of 60 mean, peak 14.5 GB | replay batch 6 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-13 22:21 PST | gate-1799206c-b5 | c3d-highcpu-60 | us-central1-a | 0.370 | 0.200 | exit 0 | load 66.6 of 60 mean, peak 14.4 GB | replay batch 5 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-13 22:39 PST | gate-1799206c-b12 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 60.3 of 60 mean, peak 10.2 GB | replay batch 12 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-13 22:37 PST | gate-1799206c-b11 | c3d-highcpu-60 | us-west1-a | 0.123 | 0.067 | exit 0 | load 62.5 of 60 mean, peak 10.4 GB | replay batch 11 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-13 22:45 PST | gate-1799206c-b16 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 1799206c, 40 workers, 106 of 106 games |
| 2026-11-13 22:46 PST | gate-1799206c-b15 | c3d-highcpu-60 | us-west1-a | 0.087 | 0.047 | exit 0 | load 45.5 of 60 mean, peak 10.2 GB | replay batch 15 at 1799206c, 40 workers, 618 of 618 games |
| 2026-11-13 22:43 PST | gate-1799206c-b9 | c3d-highcpu-60 | us-central1-a | 0.264 | 0.143 | exit 0 | load 67.0 of 60 mean, peak 14.0 GB | replay batch 9 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-13 22:43 PST | gate-1799206c-b10 | c3d-highcpu-60 | us-east1-b | 0.369 | 0.200 | exit 0 | load 63.9 of 60 mean, peak 15.3 GB | replay batch 10 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-13 23:00 PST | gate-1799206c-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 66.1 of 60 mean, peak 10.9 GB | replay batch 13 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-13 23:05 PST | gate-1799206c-b14 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 60.4 of 60 mean, peak 10.1 GB | replay batch 14 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-13 23:07 PST | gate-1799206c-pilots | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 58.0 of 60 mean, peak 9.9 GB | replay batch pilots at 1799206c, 40 workers, 1353 of 1353 games |
| 2026-11-14 01:04 PST | gate-2d807ffd-b1 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.047 | exit 0 | load 49.8 of 60 mean, peak 8.0 GB | replay batch 1 at 2d807ffd, 40 workers, 5000 of 5000 games |
| 2026-11-14 01:04 PST | gate-2d807ffd-b2 | c3d-highcpu-60 | us-east1-b | 0.087 | 0.047 | exit 0 | load 53.2 of 60 mean, peak 6.9 GB | replay batch 2 at 2d807ffd, 40 workers, 5000 of 5000 games |
| 2026-11-14 01:04 PST | gate-2d807ffd-b3 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 48.5 of 60 mean, peak 7.8 GB | replay batch 3 at 2d807ffd, 40 workers, 5000 of 5000 games |
| 2026-11-14 01:04 PST | gate-2d807ffd-b4 | c3d-highcpu-60 | us-central1-a | 0.122 | 0.066 | exit 0 | load 65.5 of 60 mean, peak 9.0 GB | replay batch 4 at 2d807ffd, 40 workers, 5000 of 5000 games |
| 2026-11-14 01:11 PST | gate-2d807ffd-b7 | c3d-highcpu-60 | us-west1-a | 0.229 | 0.124 | exit 0 | load 67.2 of 60 mean, peak 11.9 GB | replay batch 7 at 2d807ffd, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:11 PST | gate-2d807ffd-b8 | c3d-highcpu-60 | us-central1-a | 0.264 | 0.143 | exit 0 | load 67.3 of 60 mean, peak 13.4 GB | replay batch 8 at 2d807ffd, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:09 PST | gate-2d807ffd-b5 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.181 | exit 0 | load 67.0 of 60 mean, peak 15.3 GB | replay batch 5 at 2d807ffd, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:26 PST | gate-2d807ffd-b11 | c3d-highcpu-60 | us-west1-a | 0.087 | 0.047 | exit 0 | load 59.5 of 60 mean, peak 9.7 GB | replay batch 11 at 2d807ffd, 40 workers, 1500 of 1500 games |
| 2026-11-14 01:10 PST | gate-2d807ffd-b6 | c3d-highcpu-60 | us-east1-b | 0.369 | 0.200 | exit 0 | load 67.7 of 60 mean, peak 13.5 GB | replay batch 6 at 2d807ffd, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:28 PST | gate-2d807ffd-b12 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 62.7 of 60 mean, peak 10.3 GB | replay batch 12 at 2d807ffd, 40 workers, 1500 of 1500 games |
| 2026-11-14 01:32 PST | gate-2d807ffd-b15 | c3d-highcpu-60 | us-west1-a | 0.052 | 0.028 | exit 0 | load 49.0 of 60 mean, peak 10.2 GB | replay batch 15 at 2d807ffd, 40 workers, 618 of 618 games |
| 2026-11-14 01:35 PST | gate-2d807ffd-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at 2d807ffd, 40 workers, 106 of 106 games |
| 2026-11-14 01:30 PST | gate-2d807ffd-b9 | c3d-highcpu-60 | us-central1-a | 0.263 | 0.142 | exit 0 | load 68.1 of 60 mean, peak 13.1 GB | replay batch 9 at 2d807ffd, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:46 PST | gate-2d807ffd-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.3 of 60 mean, peak 10.9 GB | replay batch 13 at 2d807ffd, 40 workers, 1500 of 1500 games |
| 2026-11-14 01:33 PST | gate-2d807ffd-b10 | c3d-highcpu-60 | us-east1-b | 0.403 | 0.218 | exit 0 | load 64.2 of 60 mean, peak 15.0 GB | replay batch 10 at 2d807ffd, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:53 PST | gate-2d807ffd-pilots | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 58.1 of 60 mean, peak 9.9 GB | replay batch pilots at 2d807ffd, 40 workers, 1353 of 1353 games |
| 2026-11-14 02:00 PST | gate-1799206c-b1 | c3d-highcpu-60 | us-central1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 1 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-14 02:00 PST | gate-1799206c-b4 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 4 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-14 02:01 PST | gate-1799206c-b2 | c3d-highcpu-60 | us-west1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch 2 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-14 02:01 PST | gate-1799206c-b5 | c3d-highcpu-60 | us-central1-b | 0.024 | 0.013 | exit 0 | not sampled | replay batch 5 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-14 02:02 PST | gate-1799206c-b8 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 8 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-14 02:02 PST | gate-1799206c-b6 | c3d-highcpu-60 | us-central1-f | 0.018 | 0.010 | exit 0 | not sampled | replay batch 6 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-14 02:03 PST | gate-1799206c-b12 | c3d-highcpu-60 | us-central1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch 12 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-14 02:04 PST | gate-1799206c-b9 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 9 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-14 01:58 PST | gate-2d807ffd-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 64.2 of 60 mean, peak 10.8 GB | replay batch 14 at 2d807ffd, 40 workers, 1500 of 1500 games |
| 2026-11-14 02:04 PST | gate-1799206c-b10 | c3d-highcpu-60 | us-west1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch 10 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-14 02:05 PST | gate-1799206c-b16 | c3d-highcpu-60 | us-central1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch 16 at 1799206c, 40 workers, 106 of 106 games |
| 2026-11-14 02:05 PST | gate-1799206c-b13 | c3d-highcpu-60 | us-central1-c | 0.017 | 0.009 | exit 0 | not sampled | replay batch 13 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-14 02:06 PST | gate-1799206c-b14 | c3d-highcpu-60 | us-central1-b | 0.017 | 0.009 | exit 0 | not sampled | replay batch 14 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-14 02:06 PST | gate-1799206c-pilots | c3d-highcpu-60 | us-central1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch pilots at 1799206c, 40 workers, 1353 of 1353 games |
| 2026-11-14 02:07 PST | gate-1799206c-b3 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.010 | exit 0 | not sampled | replay batch 3 at 1799206c, 40 workers, 5000 of 5000 games |
| 2026-11-14 02:08 PST | gate-1799206c-b7 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 7 at 1799206c, 40 workers, 3000 of 3000 games |
| 2026-11-14 02:10 PST | gate-1799206c-b11 | c3d-highcpu-60 | us-central1-a | 0.021 | 0.011 | exit 0 | not sampled | replay batch 11 at 1799206c, 40 workers, 1500 of 1500 games |
| 2026-11-14 02:11 PST | gate-1799206c-b15 | c3d-highcpu-60 | us-central1-a | 0.017 | 0.009 | exit 0 | not sampled | replay batch 15 at 1799206c, 40 workers, 618 of 618 games |
| 2026-11-14 04:07 PST | gate-394270e2-b2 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 52.5 of 60 mean, peak 7.7 GB | replay batch 2 at 394270e2, 40 workers, 5000 of 5000 games |
| 2026-11-14 04:07 PST | gate-394270e2-b1 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.050 | exit 0 | load 52.5 of 60 mean, peak 7.5 GB | replay batch 1 at 394270e2, 40 workers, 5000 of 5000 games |
| 2026-11-14 04:08 PST | gate-394270e2-b3 | c3d-highcpu-60 | us-west1-a | 0.093 | 0.050 | exit 0 | load 49.8 of 60 mean, peak 7.8 GB | replay batch 3 at 394270e2, 40 workers, 5000 of 5000 games |
| 2026-11-14 04:07 PST | gate-394270e2-b4 | c3d-highcpu-60 | us-central1-a | 0.165 | 0.089 | exit 0 | load 70.9 of 60 mean, peak 8.8 GB | replay batch 4 at 394270e2, 40 workers, 5000 of 5000 games |
| 2026-11-14 04:15 PST | gate-394270e2-b7 | c3d-highcpu-60 | us-west1-a | 0.230 | 0.124 | exit 0 | load 68.3 of 60 mean, peak 11.8 GB | replay batch 7 at 394270e2, 40 workers, 3000 of 3000 games |
| 2026-11-14 04:17 PST | gate-394270e2-b8 | c3d-highcpu-60 | us-central1-a | 0.298 | 0.161 | exit 0 | load 67.9 of 60 mean, peak 12.6 GB | replay batch 8 at 394270e2, 40 workers, 3000 of 3000 games |
| 2026-11-14 04:13 PST | gate-394270e2-b6 | c3d-highcpu-60 | us-central1-a | 0.370 | 0.200 | exit 0 | load 67.7 of 60 mean, peak 13.4 GB | replay batch 6 at 394270e2, 40 workers, 3000 of 3000 games |
| 2026-11-14 04:30 PST | gate-394270e2-b11 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 61.2 of 60 mean, peak 10.3 GB | replay batch 11 at 394270e2, 40 workers, 1500 of 1500 games |
| 2026-11-14 04:14 PST | gate-394270e2-b5 | c3d-highcpu-60 | us-east1-b | 0.371 | 0.201 | exit 0 | load 67.1 of 60 mean, peak 14.2 GB | replay batch 5 at 394270e2, 40 workers, 3000 of 3000 games |
| 2026-11-14 04:36 PST | gate-394270e2-b15 | c3d-highcpu-60 | us-east1-c | 0.053 | 0.029 | exit 0 | load 47.3 of 60 mean, peak 10.2 GB | replay batch 15 at 394270e2, 40 workers, 618 of 618 games |
| 2026-11-14 04:36 PST | gate-394270e2-b12 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 65.0 of 60 mean, peak 10.5 GB | replay batch 12 at 394270e2, 40 workers, 1500 of 1500 games |
| 2026-11-14 04:43 PST | gate-394270e2-b16 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 394270e2, 40 workers, 106 of 106 games |
| 2026-11-14 04:37 PST | gate-394270e2-b9 | c3d-highcpu-60 | us-west1-a | 0.297 | 0.161 | exit 0 | load 68.6 of 60 mean, peak 13.7 GB | replay batch 9 at 394270e2, 40 workers, 3000 of 3000 games |
| 2026-11-14 04:36 PST | gate-394270e2-b10 | c3d-highcpu-60 | us-central1-a | 0.403 | 0.218 | exit 0 | load 64.8 of 60 mean, peak 15.4 GB | replay batch 10 at 394270e2, 40 workers, 3000 of 3000 games |
| 2026-11-14 04:56 PST | gate-394270e2-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 68.3 of 60 mean, peak 10.7 GB | replay batch 13 at 394270e2, 40 workers, 1500 of 1500 games |
| 2026-11-14 05:00 PST | gate-394270e2-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 61.0 of 60 mean, peak 10.5 GB | replay batch 14 at 394270e2, 40 workers, 1500 of 1500 games |
| 2026-11-14 05:03 PST | gate-394270e2-pilots | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 65.3 of 60 mean, peak 10.0 GB | replay batch pilots at 394270e2, 40 workers, 1353 of 1353 games |
| 2026-11-14 06:47 PST | gate-b80073b0-b2 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 53.8 of 60 mean, peak 7.4 GB | replay batch 2 at b80073b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 06:47 PST | gate-b80073b0-b1 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 52.6 of 60 mean, peak 7.5 GB | replay batch 1 at b80073b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 06:48 PST | gate-b80073b0-b3 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.048 | exit 0 | load 49.9 of 60 mean, peak 7.9 GB | replay batch 3 at b80073b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 06:48 PST | gate-b80073b0-b4 | c3d-highcpu-60 | us-west1-c | 0.123 | 0.067 | exit 0 | load 68.7 of 60 mean, peak 8.7 GB | replay batch 4 at b80073b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 06:54 PST | gate-b80073b0-b7 | c3d-highcpu-60 | us-east1-c | 0.229 | 0.124 | exit 0 | load 67.4 of 60 mean, peak 11.5 GB | replay batch 7 at b80073b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 06:57 PST | gate-b80073b0-b8 | c3d-highcpu-60 | us-west1-c | 0.263 | 0.142 | exit 0 | load 68.2 of 60 mean, peak 12.6 GB | replay batch 8 at b80073b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 06:53 PST | gate-b80073b0-b6 | c3d-highcpu-60 | us-central1-a | 0.369 | 0.200 | exit 0 | load 67.2 of 60 mean, peak 13.6 GB | replay batch 6 at b80073b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 07:09 PST | gate-b80073b0-b11 | c3d-highcpu-60 | us-east1-b | 0.123 | 0.067 | exit 0 | load 61.4 of 60 mean, peak 10.6 GB | replay batch 11 at b80073b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 06:53 PST | gate-b80073b0-b5 | c3d-highcpu-60 | us-central1-a | 0.404 | 0.219 | exit 0 | load 67.4 of 60 mean, peak 13.4 GB | replay batch 5 at b80073b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 07:17 PST | gate-b80073b0-b15 | c3d-highcpu-60 | us-west1-a | 0.053 | 0.029 | exit 0 | load 48.9 of 60 mean, peak 10.6 GB | replay batch 15 at b80073b0, 40 workers, 618 of 618 games |
| 2026-11-14 07:14 PST | gate-b80073b0-b12 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 64.0 of 60 mean, peak 10.1 GB | replay batch 12 at b80073b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 07:22 PST | gate-b80073b0-b16 | c3d-highcpu-60 | us-east1-c | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at b80073b0, 40 workers, 106 of 106 games |
| 2026-11-14 07:17 PST | gate-b80073b0-b9 | c3d-highcpu-60 | us-central1-a | 0.298 | 0.161 | exit 0 | load 67.3 of 60 mean, peak 13.1 GB | replay batch 9 at b80073b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 07:15 PST | gate-b80073b0-b10 | c3d-highcpu-60 | us-central1-a | 0.404 | 0.219 | exit 0 | load 64.6 of 60 mean, peak 16.3 GB | replay batch 10 at b80073b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 07:36 PST | gate-b80073b0-b13 | c3d-highcpu-60 | us-central1-b | 0.123 | 0.067 | exit 0 | load 66.3 of 60 mean, peak 11.1 GB | replay batch 13 at b80073b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 07:40 PST | gate-b80073b0-b14 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 58.1 of 60 mean, peak 11.1 GB | replay batch 14 at b80073b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 07:44 PST | gate-b80073b0-pilots | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 65.1 of 60 mean, peak 10.3 GB | replay batch pilots at b80073b0, 40 workers, 1353 of 1353 games |
| 2026-11-14 10:33 PST | gate-602f66dc-b1 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 49.6 of 60 mean, peak 7.6 GB | replay batch 1 at 602f66dc, 40 workers, 5000 of 5000 games |
| 2026-11-14 10:33 PST | gate-602f66dc-b3 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 51.1 of 60 mean, peak 7.6 GB | replay batch 3 at 602f66dc, 40 workers, 5000 of 5000 games |
| 2026-11-14 10:34 PST | gate-602f66dc-b2 | c3d-highcpu-60 | us-west1-a | 0.093 | 0.050 | exit 0 | load 50.5 of 60 mean, peak 8.1 GB | replay batch 2 at 602f66dc, 40 workers, 5000 of 5000 games |
| 2026-11-14 10:34 PST | gate-602f66dc-b4 | c3d-highcpu-60 | us-east1-c | 0.166 | 0.090 | exit 0 | load 70.1 of 60 mean, peak 9.2 GB | replay batch 4 at 602f66dc, 40 workers, 5000 of 5000 games |
| 2026-11-14 10:39 PST | gate-602f66dc-b7 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.124 | exit 0 | load 67.8 of 60 mean, peak 11.8 GB | replay batch 7 at 602f66dc, 40 workers, 3000 of 3000 games |
| 2026-11-14 10:54 PST | gate-602f66dc-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 62.2 of 60 mean, peak 9.9 GB | replay batch 11 at 602f66dc, 40 workers, 1500 of 1500 games |
| 2026-11-14 10:41 PST | gate-602f66dc-b6 | c3d-highcpu-60 | us-west1-a | 0.334 | 0.181 | exit 0 | load 66.8 of 60 mean, peak 14.5 GB | replay batch 6 at 602f66dc, 40 workers, 3000 of 3000 games |
| 2026-11-14 10:39 PST | gate-602f66dc-b5 | c3d-highcpu-60 | us-central1-a | 0.370 | 0.200 | exit 0 | load 66.4 of 60 mean, peak 15.1 GB | replay batch 5 at 602f66dc, 40 workers, 3000 of 3000 games |
| 2026-11-14 10:45 PST | gate-602f66dc-b8 | c3d-highcpu-60 | us-east1-c | 0.300 | 0.162 | exit 0 | load 68.1 of 60 mean, peak 13.2 GB | replay batch 8 at 602f66dc, 40 workers, 3000 of 3000 games |
| 2026-11-14 11:01 PST | gate-602f66dc-b15 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.047 | exit 0 | load 50.8 of 60 mean, peak 10.6 GB | replay batch 15 at 602f66dc, 40 workers, 618 of 618 games |
| 2026-11-14 11:04 PST | gate-602f66dc-b12 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.048 | exit 0 | load 60.6 of 60 mean, peak 11.0 GB | replay batch 12 at 602f66dc, 40 workers, 1500 of 1500 games |
| 2026-11-14 11:10 PST | gate-602f66dc-b16 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 602f66dc, 40 workers, 106 of 106 games |
| 2026-11-14 11:03 PST | gate-602f66dc-b9 | c3d-highcpu-60 | us-west1-a | 0.264 | 0.143 | exit 0 | load 68.6 of 60 mean, peak 13.1 GB | replay batch 9 at 602f66dc, 40 workers, 3000 of 3000 games |
| 2026-11-14 11:19 PST | gate-602f66dc-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 66.7 of 60 mean, peak 10.2 GB | replay batch 13 at 602f66dc, 40 workers, 1500 of 1500 games |
| 2026-11-14 11:01 PST | gate-602f66dc-b10 | c3d-highcpu-60 | us-central1-a | 0.439 | 0.238 | exit 0 | load 63.7 of 60 mean, peak 15.0 GB | replay batch 10 at 602f66dc, 40 workers, 3000 of 3000 games |
| 2026-11-14 11:27 PST | gate-602f66dc-pilots | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 64.4 of 60 mean, peak 10.0 GB | replay batch pilots at 602f66dc, 40 workers, 1353 of 1353 games |
| 2026-11-14 11:28 PST | gate-602f66dc-b14 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 62.8 of 60 mean, peak 9.8 GB | replay batch 14 at 602f66dc, 40 workers, 1500 of 1500 games |
| 2026-11-14 11:51 PST | cov14-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | not sampled | coverage batch 16 at 602f66dc, 60 workers, 105 of 105 games |
| 2026-11-14 11:55 PST | cov14-b6 | c3d-highcpu-60 | us-central1-a | 0.194 | 0.105 | exit 0 | load 57.0 of 60 mean, peak 9.1 GB | coverage batch 6 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 11:55 PST | cov14-b2 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.124 | exit 0 | load 55.6 of 60 mean, peak 3.8 GB | coverage batch 2 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 11:56 PST | cov14-b4 | c3d-highcpu-60 | us-east1-c | 0.266 | 0.144 | exit 0 | load 56.4 of 60 mean, peak 4.9 GB | coverage batch 4 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 11:58 PST | cov14-repo | c3d-highcpu-60 | us-west1-a | 0.301 | 0.163 | exit 0 | load 51.5 of 60 mean, peak 4.4 GB | coverage batch repo at 602f66dc, 60 workers, 5860 of 5860 games |
| 2026-11-14 12:07 PST | cov14-b1 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.124 | exit 0 | load 54.6 of 60 mean, peak 3.8 GB | coverage batch 1 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 12:09 PST | cov14-b9 | c3d-highcpu-60 | us-central1-a | 0.229 | 0.124 | exit 0 | load 56.5 of 60 mean, peak 8.7 GB | coverage batch 9 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 12:13 PST | cov14-b3 | c3d-highcpu-60 | us-east1-c | 0.231 | 0.125 | exit 0 | load 57.0 of 60 mean, peak 3.7 GB | coverage batch 3 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 12:22 PST | cov14-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 59.5 of 60 mean, peak 5.9 GB | coverage batch 11 at 602f66dc, 60 workers, 1500 of 1500 games |
| 2026-11-14 12:17 PST | cov14-b10 | c3d-highcpu-60 | us-west1-a | 0.230 | 0.124 | exit 0 | load 55.7 of 60 mean, peak 10.4 GB | coverage batch 10 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 12:29 PST | cov14-b12 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.069 | exit 0 | load 57.4 of 60 mean, peak 6.1 GB | coverage batch 12 at 602f66dc, 60 workers, 1493 of 1493 games |
| 2026-11-14 12:24 PST | cov14-b8 | c3d-highcpu-60 | us-central1-a | 0.233 | 0.126 | exit 0 | load 61.0 of 60 mean, peak 8.1 GB | coverage batch 8 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 12:28 PST | cov14-b7 | c3d-highcpu-60 | us-east1-c | 0.200 | 0.108 | exit 0 | load 60.2 of 60 mean, peak 7.6 GB | coverage batch 7 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 12:38 PST | cov14-b15 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 39.8 of 60 mean, peak 5.9 GB | coverage batch 15 at 602f66dc, 60 workers, 618 of 618 games |
| 2026-11-14 12:38 PST | cov14-pilots | c3d-highcpu-60 | us-central1-a | 0.129 | 0.070 | exit 0 | load 60.4 of 60 mean, peak 6.6 GB | coverage batch pilots at 602f66dc, 60 workers, 1353 of 1353 games |
| 2026-11-14 12:32 PST | cov14-b5 | c3d-highcpu-60 | us-west1-a | 0.235 | 0.127 | exit 0 | load 54.5 of 60 mean, peak 8.9 GB | coverage batch 5 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 12:41 PST | cov14-b14 | c3d-highcpu-60 | us-east1-b | 0.128 | 0.069 | exit 0 | load 54.3 of 60 mean, peak 5.9 GB | coverage batch 14 at 602f66dc, 60 workers, 1491 of 1491 games |
| 2026-11-14 12:47 PST | cov14-b13 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.069 | exit 0 | load 57.2 of 60 mean, peak 7.0 GB | coverage batch 13 at 602f66dc, 60 workers, 1472 of 1472 games |
| 2026-11-14 14:21 PST | cov15-b6 | c3d-highcpu-60 | us-central1-a | 0.234 | 0.127 | exit 0 | load 62.4 of 60 mean, peak 9.0 GB | coverage batch 6 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 14:22 PST | cov15-b2 | c3d-highcpu-60 | us-east1-c | 0.235 | 0.127 | exit 0 | load 55.2 of 60 mean, peak 3.9 GB | coverage batch 2 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 14:21 PST | cov15-b4 | c3d-highcpu-60 | us-central1-a | 0.273 | 0.148 | exit 0 | load 58.5 of 60 mean, peak 4.9 GB | coverage batch 4 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 14:24 PST | cov15-repo | c3d-highcpu-60 | us-west1-a | 0.274 | 0.148 | exit 3 | load 51.3 of 60 mean, peak 4.2 GB | coverage batch repo at 602f66dc, 60 workers, 5564 of 5860 games |
| 2026-11-14 14:36 PST | cov15-b10 | c3d-highcpu-60 | us-central1-a | 0.243 | 0.132 | exit 0 | load 58.9 of 60 mean, peak 9.9 GB | coverage batch 10 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 14:38 PST | cov15-b3 | c3d-highcpu-60 | us-central1-a | 0.244 | 0.132 | exit 0 | load 56.0 of 60 mean, peak 3.8 GB | coverage batch 3 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 14:37 PST | cov15-b1 | c3d-highcpu-60 | us-east1-c | 0.261 | 0.141 | exit 0 | load 57.1 of 60 mean, peak 3.9 GB | coverage batch 1 at 602f66dc, 60 workers, 5000 of 5000 games |
| 2026-11-14 14:42 PST | cov15-b9 | c3d-highcpu-60 | us-west1-a | 0.205 | 0.111 | exit 0 | load 54.8 of 60 mean, peak 8.6 GB | coverage batch 9 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 14:51 PST | cov15-b11 | c3d-highcpu-60 | us-central1-a | 0.139 | 0.075 | exit 0 | load 55.5 of 60 mean, peak 5.8 GB | coverage batch 11 at 602f66dc, 60 workers, 1500 of 1500 games |
| 2026-11-14 14:53 PST | cov15-b7 | c3d-highcpu-60 | us-central1-a | 0.223 | 0.121 | exit 0 | load 61.5 of 60 mean, peak 7.6 GB | coverage batch 7 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 14:54 PST | cov15-b5 | c3d-highcpu-60 | us-east1-c | 0.224 | 0.121 | exit 0 | load 56.1 of 60 mean, peak 8.8 GB | coverage batch 5 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 15:03 PST | gate-13da16b0-b1 | c3d-highcpu-60 | us-central1-a | 0.106 | 0.057 | exit 0 | load 53.1 of 60 mean, peak 7.5 GB | replay batch 1 at 13da16b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 14:57 PST | cov15-b8 | c3d-highcpu-60 | us-west1-c | 0.224 | 0.121 | exit 0 | load 60.8 of 60 mean, peak 8.0 GB | coverage batch 8 at 602f66dc, 60 workers, 3000 of 3000 games |
| 2026-11-14 15:11 PST | gate-13da16b0-b2 | c3d-highcpu-60 | us-central1-a | 0.101 | 0.055 | exit 0 | load 48.9 of 60 mean, peak 7.5 GB | replay batch 2 at 13da16b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 15:13 PST | gate-13da16b0-b3 | c3d-highcpu-60 | us-west1-a | 0.104 | 0.056 | exit 0 | load 51.3 of 60 mean, peak 7.7 GB | replay batch 3 at 13da16b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 15:12 PST | gate-13da16b0-b4 | c3d-highcpu-60 | us-east1-c | 0.137 | 0.074 | exit 0 | load 67.7 of 60 mean, peak 9.2 GB | replay batch 4 at 13da16b0, 40 workers, 5000 of 5000 games |
| 2026-11-14 15:10 PST | gate-13da16b0-b5 | c3d-highcpu-60 | us-central1-a | 0.385 | 0.208 | exit 0 | load 67.1 of 60 mean, peak 14.4 GB | replay batch 5 at 13da16b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 15:21 PST | gate-13da16b0-b7 | c3d-highcpu-60 | us-west1-a | 0.232 | 0.126 | exit 0 | load 67.8 of 60 mean, peak 11.5 GB | replay batch 7 at 13da16b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 15:22 PST | gate-13da16b0-b8 | c3d-highcpu-60 | us-east1-c | 0.266 | 0.144 | exit 0 | load 68.8 of 60 mean, peak 13.0 GB | replay batch 8 at 13da16b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 15:18 PST | gate-13da16b0-b6 | c3d-highcpu-60 | us-central1-a | 0.341 | 0.185 | exit 0 | load 67.8 of 60 mean, peak 13.6 GB | replay batch 6 at 13da16b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 15:36 PST | gate-13da16b0-b11 | c3d-highcpu-60 | us-west1-a | 0.123 | 0.067 | exit 0 | load 65.4 of 60 mean, peak 10.4 GB | replay batch 11 at 13da16b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 15:39 PST | gate-13da16b0-b12 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.048 | exit 0 | load 59.6 of 60 mean, peak 10.2 GB | replay batch 12 at 13da16b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 15:45 PST | gate-13da16b0-b16 | c3d-highcpu-60 | us-east1-c | 0.052 | 0.028 | exit 0 | not sampled | replay batch 16 at 13da16b0, 40 workers, 106 of 106 games |
| 2026-11-14 15:44 PST | gate-13da16b0-b15 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 49.0 of 60 mean, peak 10.3 GB | replay batch 15 at 13da16b0, 40 workers, 618 of 618 games |
| 2026-11-14 15:34 PST | gate-13da16b0-b9 | c3d-highcpu-60 | us-central1-a | 0.298 | 0.161 | exit 0 | load 66.7 of 60 mean, peak 13.6 GB | replay batch 9 at 13da16b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 15:52 PST | gate-13da16b0-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.3 of 60 mean, peak 10.3 GB | replay batch 13 at 13da16b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 15:39 PST | gate-13da16b0-b10 | c3d-highcpu-60 | us-central1-a | 0.408 | 0.221 | exit 0 | load 63.7 of 60 mean, peak 15.8 GB | replay batch 10 at 13da16b0, 40 workers, 3000 of 3000 games |
| 2026-11-14 16:00 PST | gate-13da16b0-b17 | c3d-highcpu-60 | us-central1-a | 0.056 | 0.030 | exit 0 | load 46.5 of 60 mean, peak 9.8 GB | replay batch 17 at 13da16b0, 40 workers, 605 of 605 games |
| 2026-11-14 16:04 PST | gate-13da16b0-b14 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.069 | exit 0 | load 63.7 of 60 mean, peak 11.0 GB | replay batch 14 at 13da16b0, 40 workers, 1500 of 1500 games |
| 2026-11-14 16:12 PST | gate-13da16b0-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 59.3 of 60 mean, peak 9.3 GB | replay batch pilots at 13da16b0, 40 workers, 1353 of 1353 games |
| 2026-11-14 16:18 PST | cov15-b15 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 40.5 of 60 mean, peak 5.9 GB | coverage batch 15 at 602f66dc, 60 workers, 618 of 618 games |
| 2026-11-14 16:18 PST | cov15-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 57.2 of 60 mean, peak 6.7 GB | coverage batch 13 at 602f66dc, 60 workers, 1472 of 1472 games |
| 2026-11-14 16:19 PST | cov15-b14 | c3d-highcpu-60 | us-east1-b | 0.125 | 0.068 | exit 0 | load 53.8 of 60 mean, peak 5.9 GB | coverage batch 14 at 602f66dc, 60 workers, 1491 of 1491 games |
| 2026-11-14 16:20 PST | cov15-b12 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 59.0 of 60 mean, peak 6.1 GB | coverage batch 12 at 602f66dc, 60 workers, 1493 of 1493 games |
| 2026-11-14 16:28 PST | cov15-pilots | c3d-highcpu-60 | us-central1-a | 0.128 | 0.069 | exit 0 | load 55.3 of 60 mean, peak 6.5 GB | coverage batch pilots at 602f66dc, 60 workers, 1353 of 1353 games |
| 2026-11-14 18:00 PST | gate-da884383-b2 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 54.6 of 60 mean, peak 7.6 GB | replay batch 2 at da884383, 40 workers, 5000 of 5000 games |
| 2026-11-14 18:00 PST | gate-da884383-b3 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 52.9 of 60 mean, peak 7.6 GB | replay batch 3 at da884383, 40 workers, 5000 of 5000 games |
| 2026-11-14 18:00 PST | gate-da884383-b1 | c3d-highcpu-60 | us-east1-b | 0.094 | 0.051 | exit 0 | load 51.4 of 60 mean, peak 7.6 GB | replay batch 1 at da884383, 40 workers, 5000 of 5000 games |
| 2026-11-14 18:01 PST | gate-da884383-b4 | c3d-highcpu-60 | us-west1-c | 0.165 | 0.089 | exit 0 | load 71.1 of 60 mean, peak 9.2 GB | replay batch 4 at da884383, 40 workers, 5000 of 5000 games |
| 2026-11-14 18:06 PST | gate-da884383-b7 | c3d-highcpu-60 | us-central1-a | 0.265 | 0.143 | exit 0 | load 67.6 of 60 mean, peak 11.3 GB | replay batch 7 at da884383, 40 workers, 3000 of 3000 games |
| 2026-11-14 18:06 PST | gate-da884383-b6 | c3d-highcpu-60 | us-central1-a | 0.337 | 0.182 | exit 0 | load 66.1 of 60 mean, peak 14.5 GB | replay batch 6 at da884383, 40 workers, 3000 of 3000 games |
| 2026-11-14 18:12 PST | gate-da884383-b8 | c3d-highcpu-60 | us-west1-a | 0.263 | 0.142 | exit 0 | load 68.8 of 60 mean, peak 12.6 GB | replay batch 8 at da884383, 40 workers, 3000 of 3000 games |
| 2026-11-14 18:22 PST | gate-da884383-b11 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.069 | exit 0 | load 64.6 of 60 mean, peak 10.2 GB | replay batch 11 at da884383, 40 workers, 1500 of 1500 games |
| 2026-11-14 18:07 PST | gate-da884383-b5 | c3d-highcpu-60 | us-east1-b | 0.406 | 0.220 | exit 0 | load 65.7 of 60 mean, peak 14.1 GB | replay batch 5 at da884383, 40 workers, 3000 of 3000 games |
| 2026-11-14 18:29 PST | gate-da884383-b12 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 59.7 of 60 mean, peak 10.3 GB | replay batch 12 at da884383, 40 workers, 1500 of 1500 games |
| 2026-11-14 18:30 PST | gate-da884383-b15 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 50.0 of 60 mean, peak 10.0 GB | replay batch 15 at da884383, 40 workers, 618 of 618 games |
| 2026-11-14 18:35 PST | gate-da884383-b16 | c3d-highcpu-60 | us-west1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at da884383, 40 workers, 106 of 106 games |
| 2026-11-14 18:32 PST | gate-da884383-b9 | c3d-highcpu-60 | us-east1-b | 0.299 | 0.162 | exit 0 | load 67.7 of 60 mean, peak 13.5 GB | replay batch 9 at da884383, 40 workers, 3000 of 3000 games |
| 2026-11-14 18:27 PST | gate-da884383-b10 | c3d-highcpu-60 | us-central1-a | 0.404 | 0.219 | exit 0 | load 63.5 of 60 mean, peak 15.2 GB | replay batch 10 at da884383, 40 workers, 3000 of 3000 games |
| 2026-11-14 18:51 PST | gate-da884383-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 59.5 of 60 mean, peak 10.7 GB | replay batch 14 at da884383, 40 workers, 1500 of 1500 games |
| 2026-11-14 18:50 PST | gate-da884383-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 67.5 of 60 mean, peak 10.3 GB | replay batch 13 at da884383, 40 workers, 1500 of 1500 games |
| 2026-11-14 18:58 PST | gate-da884383-b17 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | load 46.7 of 60 mean, peak 9.5 GB | replay batch 17 at da884383, 40 workers, 605 of 605 games |
| 2026-11-14 18:57 PST | gate-da884383-pilots | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 65.2 of 60 mean, peak 10.3 GB | replay batch pilots at da884383, 40 workers, 1353 of 1353 games |
| 2026-11-15 01:25 PST | gate-7c278088-b2 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 50.7 of 60 mean, peak 7.7 GB | replay batch 2 at 7c278088, 40 workers, 5000 of 5000 games |
| 2026-11-15 01:25 PST | gate-7c278088-b3 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 52.4 of 60 mean, peak 7.6 GB | replay batch 3 at 7c278088, 40 workers, 5000 of 5000 games |
| 2026-11-15 01:26 PST | gate-7c278088-b1 | c3d-highcpu-60 | us-west1-a | 0.091 | 0.049 | exit 0 | load 50.3 of 60 mean, peak 7.9 GB | replay batch 1 at 7c278088, 40 workers, 5000 of 5000 games |
| 2026-11-15 01:26 PST | gate-7c278088-b4 | c3d-highcpu-60 | us-east1-b | 0.167 | 0.090 | exit 0 | load 71.2 of 60 mean, peak 8.9 GB | replay batch 4 at 7c278088, 40 workers, 5000 of 5000 games |
| 2026-11-15 01:31 PST | gate-7c278088-b7 | c3d-highcpu-60 | us-central1-a | 0.230 | 0.124 | exit 0 | load 67.8 of 60 mean, peak 11.4 GB | replay batch 7 at 7c278088, 40 workers, 3000 of 3000 games |
| 2026-11-15 01:45 PST | gate-7c278088-b11 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 63.5 of 60 mean, peak 10.3 GB | replay batch 11 at 7c278088, 40 workers, 1500 of 1500 games |
| 2026-11-15 01:31 PST | gate-7c278088-b6 | c3d-highcpu-60 | us-central1-a | 0.336 | 0.182 | exit 0 | load 67.6 of 60 mean, peak 14.1 GB | replay batch 6 at 7c278088, 40 workers, 3000 of 3000 games |
| 2026-11-15 01:37 PST | gate-7c278088-b8 | c3d-highcpu-60 | us-east1-b | 0.264 | 0.143 | exit 0 | load 68.2 of 60 mean, peak 12.9 GB | replay batch 8 at 7c278088, 40 workers, 3000 of 3000 games |
| 2026-11-15 01:51 PST | gate-7c278088-b15 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | load 47.5 of 60 mean, peak 10.5 GB | replay batch 15 at 7c278088, 40 workers, 618 of 618 games |
| 2026-11-15 01:33 PST | gate-7c278088-b5 | c3d-highcpu-60 | us-west1-a | 0.372 | 0.201 | exit 0 | load 68.0 of 60 mean, peak 14.2 GB | replay batch 5 at 7c278088, 40 workers, 3000 of 3000 games |
| 2026-11-15 01:53 PST | gate-7c278088-b12 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 59.8 of 60 mean, peak 9.7 GB | replay batch 12 at 7c278088, 40 workers, 1500 of 1500 games |
| 2026-11-15 01:55 PST | gate-7c278088-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 56.9 of 60 mean, peak 9.6 GB | replay batch pilots at 7c278088, 40 workers, 1353 of 1353 games |
| 2026-11-15 02:00 PST | gate-7c278088-b16 | c3d-highcpu-60 | us-east1-b | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 7c278088, 40 workers, 106 of 106 games |
| 2026-11-15 02:00 PST | gate-8dad6be4-b3 | c3d-highcpu-60 | us-central1-f | 0.090 | 0.049 | exit 0 | load 50.4 of 60 mean, peak 7.7 GB | replay batch 3 at 8dad6be4, 40 workers, 5000 of 5000 games |
| 2026-11-15 02:07 PST | gate-8dad6be4-b2 | c3d-highcpu-60 | us-east1-b | 0.087 | 0.047 | exit 0 | load 48.5 of 60 mean, peak 8.1 GB | replay batch 2 at 8dad6be4, 40 workers, 5000 of 5000 games |
| 2026-11-15 01:52 PST | gate-7c278088-b10 | c3d-highcpu-60 | us-central1-a | 0.374 | 0.202 | exit 0 | load 63.4 of 60 mean, peak 15.2 GB | replay batch 10 at 7c278088, 40 workers, 3000 of 3000 games |
| 2026-11-15 01:57 PST | gate-7c278088-b9 | c3d-highcpu-60 | us-west1-a | 0.299 | 0.162 | exit 0 | load 67.6 of 60 mean, peak 14.0 GB | replay batch 9 at 7c278088, 40 workers, 3000 of 3000 games |
| 2026-11-15 02:15 PST | gate-7c278088-b14 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 60.0 of 60 mean, peak 10.4 GB | replay batch 14 at 7c278088, 40 workers, 1500 of 1500 games |
| 2026-11-15 02:07 PST | gate-8dad6be4-b7 | c3d-highcpu-60 | us-central1-a | 0.225 | 0.122 | exit 0 | load 66.3 of 60 mean, peak 11.7 GB | replay batch 7 at 8dad6be4, 40 workers, 3000 of 3000 games |
| 2026-11-15 02:16 PST | gate-7c278088-b13 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 68.1 of 60 mean, peak 10.3 GB | replay batch 13 at 7c278088, 40 workers, 1500 of 1500 games |
| 2026-11-15 02:20 PST | gate-8dad6be4-b1 | c3d-highcpu-60 | us-central1-f | 0.087 | 0.047 | exit 0 | load 49.6 of 60 mean, peak 7.5 GB | replay batch 1 at 8dad6be4, 40 workers, 5000 of 5000 games |
| 2026-11-15 02:25 PST | gate-7c278088-b17 | c3d-highcpu-60 | us-west1-a | 0.054 | 0.029 | exit 0 | load 48.3 of 60 mean, peak 10.3 GB | replay batch 17 at 7c278088, 40 workers, 605 of 605 games |
| 2026-11-15 02:20 PST | gate-8dad6be4-b4 | c3d-highcpu-60 | us-central1-c | 0.157 | 0.085 | exit 0 | load 73.1 of 60 mean, peak 9.0 GB | replay batch 4 at 8dad6be4, 40 workers, 5000 of 5000 games |
| 2026-11-15 02:13 PST | gate-8dad6be4-b6 | c3d-highcpu-60 | us-east1-b | 0.330 | 0.179 | exit 0 | load 67.4 of 60 mean, peak 14.5 GB | replay batch 6 at 8dad6be4, 40 workers, 3000 of 3000 games |
| 2026-11-15 02:34 PST | gate-8dad6be4-b11 | c3d-highcpu-60 | us-west1-a | 0.087 | 0.047 | exit 0 | load 62.4 of 60 mean, peak 9.6 GB | replay batch 11 at 8dad6be4, 40 workers, 1500 of 1500 games |
| 2026-11-15 02:41 PST | gate-7c278088-b18 | c3d-highcpu-60 | us-west1-a | 0.053 | 0.029 | exit 0 | load 49.5 of 60 mean, peak 9.9 GB | replay batch 18 at 7c278088, 40 workers, 605 of 605 games |
| 2026-11-15 02:30 PST | gate-8dad6be4-b8 | c3d-highcpu-60 | us-central1-a | 0.261 | 0.141 | exit 0 | load 66.2 of 60 mean, peak 13.0 GB | replay batch 8 at 8dad6be4, 40 workers, 3000 of 3000 games |
| 2026-11-15 02:26 PST | gate-8dad6be4-b5 | c3d-highcpu-60 | us-central1-a | 0.364 | 0.197 | exit 0 | load 67.1 of 60 mean, peak 14.4 GB | replay batch 5 at 8dad6be4, 40 workers, 3000 of 3000 games |
| 2026-11-15 02:47 PST | gate-8dad6be4-b15 | c3d-highcpu-60 | us-west1-a | 0.052 | 0.028 | exit 0 | load 47.1 of 60 mean, peak 10.5 GB | replay batch 15 at 8dad6be4, 40 workers, 618 of 618 games |
| 2026-11-15 02:46 PST | gate-8dad6be4-b12 | c3d-highcpu-60 | us-central1-a | 0.121 | 0.065 | exit 0 | load 62.8 of 60 mean, peak 10.2 GB | replay batch 12 at 8dad6be4, 40 workers, 1500 of 1500 games |
| 2026-11-15 02:34 PST | gate-8dad6be4-b10 | c3d-highcpu-60 | us-east1-b | 0.364 | 0.197 | exit 0 | load 63.4 of 60 mean, peak 15.5 GB | replay batch 10 at 8dad6be4, 40 workers, 3000 of 3000 games |
| 2026-11-15 02:53 PST | gate-8dad6be4-b16 | c3d-highcpu-60 | us-central1-a | 0.051 | 0.028 | exit 0 | not sampled | replay batch 16 at 8dad6be4, 40 workers, 106 of 106 games |
| 2026-11-15 02:51 PST | gate-8dad6be4-pilots | c3d-highcpu-60 | us-west1-a | 0.086 | 0.047 | exit 0 | load 60.6 of 60 mean, peak 10.1 GB | replay batch pilots at 8dad6be4, 40 workers, 1353 of 1353 games |
| 2026-11-15 02:56 PST | gate-8dad6be4-b14 | c3d-highcpu-60 | us-central1-f | 0.087 | 0.047 | exit 0 | load 60.5 of 60 mean, peak 10.3 GB | replay batch 14 at 8dad6be4, 40 workers, 1500 of 1500 games |
| 2026-11-15 03:02 PST | gate-8dad6be4-b18 | c3d-highcpu-60 | us-central1-a | 0.052 | 0.028 | exit 0 | load 46.8 of 60 mean, peak 9.3 GB | replay batch 18 at 8dad6be4, 40 workers, 605 of 605 games |
| 2026-11-15 02:48 PST | gate-8dad6be4-b9 | c3d-highcpu-60 | us-central1-a | 0.296 | 0.160 | exit 0 | load 66.5 of 60 mean, peak 13.3 GB | replay batch 9 at 8dad6be4, 40 workers, 3000 of 3000 games |
| 2026-11-15 03:06 PST | gate-8dad6be4-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 65.6 of 60 mean, peak 10.8 GB | replay batch 13 at 8dad6be4, 40 workers, 1500 of 1500 games |
| 2026-11-15 03:14 PST | gate-8dad6be4-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 46.7 of 60 mean, peak 9.8 GB | replay batch 17 at 8dad6be4, 40 workers, 605 of 605 games |
| 2026-11-15 06:57 PST | gate-d641235e-b2 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 51.3 of 60 mean, peak 7.6 GB | replay batch 2 at d641235e, 40 workers, 5000 of 5000 games |
| 2026-11-15 06:57 PST | gate-d641235e-b1 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.051 | exit 0 | load 53.4 of 60 mean, peak 7.6 GB | replay batch 1 at d641235e, 40 workers, 5000 of 5000 games |
| 2026-11-15 06:58 PST | gate-d641235e-b3 | c3d-highcpu-60 | us-east1-b | 0.094 | 0.051 | exit 0 | load 50.7 of 60 mean, peak 7.2 GB | replay batch 3 at d641235e, 40 workers, 5000 of 5000 games |
| 2026-11-15 06:58 PST | gate-d641235e-b4 | c3d-highcpu-60 | us-west1-c | 0.154 | 0.083 | exit 0 | load 67.2 of 60 mean, peak 9.2 GB | replay batch 4 at d641235e, 40 workers, 5000 of 5000 games |
| 2026-11-15 07:04 PST | gate-d641235e-b7 | c3d-highcpu-60 | us-east1-b | 0.268 | 0.145 | exit 0 | load 69.3 of 60 mean, peak 11.9 GB | replay batch 7 at d641235e, 40 workers, 3000 of 3000 games |
| 2026-11-15 07:03 PST | gate-d641235e-b6 | c3d-highcpu-60 | us-central1-a | 0.341 | 0.185 | exit 0 | load 67.7 of 60 mean, peak 14.5 GB | replay batch 6 at d641235e, 40 workers, 3000 of 3000 games |
| 2026-11-15 07:09 PST | gate-d641235e-b8 | c3d-highcpu-60 | us-west1-c | 0.267 | 0.145 | exit 0 | load 67.0 of 60 mean, peak 12.3 GB | replay batch 8 at d641235e, 40 workers, 3000 of 3000 games |
| 2026-11-15 07:22 PST | gate-d641235e-b11 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.049 | exit 0 | load 58.8 of 60 mean, peak 9.9 GB | replay batch 11 at d641235e, 40 workers, 1500 of 1500 games |
| 2026-11-15 07:03 PST | gate-d641235e-b5 | c3d-highcpu-60 | us-central1-a | 0.409 | 0.221 | exit 0 | load 67.1 of 60 mean, peak 13.3 GB | replay batch 5 at d641235e, 40 workers, 3000 of 3000 games |
| 2026-11-15 07:28 PST | gate-d641235e-b15 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.049 | exit 0 | load 47.5 of 60 mean, peak 10.4 GB | replay batch 15 at d641235e, 40 workers, 618 of 618 games |
| 2026-11-15 07:26 PST | gate-d641235e-b12 | c3d-highcpu-60 | us-west1-c | 0.124 | 0.067 | exit 0 | load 65.4 of 60 mean, peak 10.0 GB | replay batch 12 at d641235e, 40 workers, 1500 of 1500 games |
| 2026-11-15 07:35 PST | gate-d641235e-b16 | c3d-highcpu-60 | us-west1-c | 0.055 | 0.030 | exit 0 | not sampled | replay batch 16 at d641235e, 40 workers, 106 of 106 games |
| 2026-11-15 07:34 PST | gate-d641235e-b20 | c3d-highcpu-60 | us-east1-c | 0.092 | 0.050 | exit 0 | load 46.6 of 60 mean, peak 10.1 GB | replay batch 20 at d641235e, 40 workers, 605 of 605 games |
| 2026-11-15 07:28 PST | gate-d641235e-b9 | c3d-highcpu-60 | us-central1-a | 0.303 | 0.164 | exit 0 | load 67.6 of 60 mean, peak 14.1 GB | replay batch 9 at d641235e, 40 workers, 3000 of 3000 games |
| 2026-11-15 07:24 PST | gate-d641235e-b10 | c3d-highcpu-60 | us-central1-a | 0.372 | 0.201 | exit 0 | load 64.4 of 60 mean, peak 15.7 GB | replay batch 10 at d641235e, 40 workers, 3000 of 3000 games |
| 2026-11-15 07:40 PST | gate-d641235e-pilots | c3d-highcpu-60 | us-west1-c | 0.124 | 0.067 | exit 0 | load 64.4 of 60 mean, peak 10.5 GB | replay batch pilots at d641235e, 40 workers, 1353 of 1353 games |
| 2026-11-15 07:47 PST | gate-d641235e-b13 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.068 | exit 0 | load 68.8 of 60 mean, peak 9.9 GB | replay batch 13 at d641235e, 40 workers, 1500 of 1500 games |
| 2026-11-15 07:47 PST | gate-d641235e-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 63.6 of 60 mean, peak 10.2 GB | replay batch 14 at d641235e, 40 workers, 1500 of 1500 games |
| 2026-11-15 07:55 PST | gate-d641235e-b18 | c3d-highcpu-60 | us-central1-a | 0.052 | 0.028 | exit 0 | load 51.4 of 60 mean, peak 9.5 GB | replay batch 18 at d641235e, 40 workers, 605 of 605 games |
| 2026-11-15 07:55 PST | gate-d641235e-b17 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | load 47.9 of 60 mean, peak 9.9 GB | replay batch 17 at d641235e, 40 workers, 605 of 605 games |
| 2026-11-15 09:48 PST | gate-759d2e43-b1 | c3d-highcpu-60 | us-central1-a | 0.099 | 0.054 | exit 0 | load 51.1 of 60 mean, peak 7.5 GB | replay batch 1 at 759d2e43, 40 workers, 5000 of 5000 games |
| 2026-11-15 09:48 PST | gate-759d2e43-b2 | c3d-highcpu-60 | us-central1-a | 0.100 | 0.054 | exit 0 | load 53.4 of 60 mean, peak 7.7 GB | replay batch 2 at 759d2e43, 40 workers, 5000 of 5000 games |
| 2026-11-15 09:49 PST | gate-759d2e43-b3 | c3d-highcpu-60 | us-west1-c | 0.099 | 0.054 | exit 0 | load 48.5 of 60 mean, peak 7.4 GB | replay batch 3 at 759d2e43, 40 workers, 5000 of 5000 games |
| 2026-11-15 09:49 PST | gate-759d2e43-b4 | c3d-highcpu-60 | us-east1-c | 0.180 | 0.097 | exit 0 | load 70.1 of 60 mean, peak 9.3 GB | replay batch 4 at 759d2e43, 40 workers, 5000 of 5000 games |
| 2026-11-15 09:57 PST | gate-759d2e43-b7 | c3d-highcpu-60 | us-west1-a | 0.234 | 0.127 | exit 0 | load 69.3 of 60 mean, peak 13.0 GB | replay batch 7 at 759d2e43, 40 workers, 3000 of 3000 games |
| 2026-11-15 09:54 PST | gate-759d2e43-b6 | c3d-highcpu-60 | us-central1-a | 0.346 | 0.187 | exit 0 | load 65.7 of 60 mean, peak 14.3 GB | replay batch 6 at 759d2e43, 40 workers, 3000 of 3000 games |
| 2026-11-15 10:01 PST | gate-759d2e43-b8 | c3d-highcpu-60 | us-east1-c | 0.268 | 0.145 | exit 0 | load 68.4 of 60 mean, peak 12.7 GB | replay batch 8 at 759d2e43, 40 workers, 3000 of 3000 games |
| 2026-11-15 09:54 PST | gate-759d2e43-b5 | c3d-highcpu-60 | us-central1-a | 0.381 | 0.206 | exit 0 | load 66.4 of 60 mean, peak 15.0 GB | replay batch 5 at 759d2e43, 40 workers, 3000 of 3000 games |
| 2026-11-15 10:12 PST | gate-759d2e43-b11 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 60.1 of 60 mean, peak 9.5 GB | replay batch 11 at 759d2e43, 40 workers, 1500 of 1500 games |
| 2026-11-15 10:19 PST | gate-759d2e43-b15 | c3d-highcpu-60 | us-west1-a | 0.054 | 0.029 | exit 0 | load 47.3 of 60 mean, peak 10.1 GB | replay batch 15 at 759d2e43, 40 workers, 618 of 618 games |
| 2026-11-15 10:17 PST | gate-759d2e43-b12 | c3d-highcpu-60 | us-central1-b | 0.090 | 0.049 | exit 0 | load 62.6 of 60 mean, peak 10.4 GB | replay batch 12 at 759d2e43, 40 workers, 1500 of 1500 games |
| 2026-11-15 10:24 PST | gate-759d2e43-b16 | c3d-highcpu-60 | us-west1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 759d2e43, 40 workers, 106 of 106 games |
| 2026-11-15 10:23 PST | gate-759d2e43-b20 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 49.3 of 60 mean, peak 10.3 GB | replay batch 20 at 759d2e43, 40 workers, 605 of 605 games |
| 2026-11-15 10:28 PST | gate-759d2e43-pilots | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 60.6 of 60 mean, peak 10.4 GB | replay batch pilots at 759d2e43, 40 workers, 1353 of 1353 games |
| 2026-11-15 10:18 PST | gate-759d2e43-b9 | c3d-highcpu-60 | us-east1-c | 0.301 | 0.163 | exit 0 | load 67.7 of 60 mean, peak 13.5 GB | replay batch 9 at 759d2e43, 40 workers, 3000 of 3000 games |
| 2026-11-15 10:15 PST | gate-759d2e43-b10 | c3d-highcpu-60 | us-central1-a | 0.406 | 0.220 | exit 0 | load 64.6 of 60 mean, peak 14.5 GB | replay batch 10 at 759d2e43, 40 workers, 3000 of 3000 games |
| 2026-11-15 10:37 PST | gate-759d2e43-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 67.9 of 60 mean, peak 11.1 GB | replay batch 13 at 759d2e43, 40 workers, 1500 of 1500 games |
| 2026-11-15 10:40 PST | gate-759d2e43-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 60.2 of 60 mean, peak 10.8 GB | replay batch 14 at 759d2e43, 40 workers, 1500 of 1500 games |
| 2026-11-15 10:45 PST | gate-759d2e43-b17 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | load 44.4 of 60 mean, peak 10.5 GB | replay batch 17 at 759d2e43, 40 workers, 605 of 605 games |
| 2026-11-15 10:46 PST | gate-759d2e43-b18 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | load 45.8 of 60 mean, peak 9.5 GB | replay batch 18 at 759d2e43, 40 workers, 605 of 605 games |
| 2026-11-15 11:25 PST | gate-397f540b-b3 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 55.5 of 60 mean, peak 7.4 GB | replay batch 3 at 397f540b, 40 workers, 5000 of 5000 games |
| 2026-11-15 11:25 PST | gate-397f540b-b1 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.051 | exit 0 | load 53.5 of 60 mean, peak 7.2 GB | replay batch 1 at 397f540b, 40 workers, 5000 of 5000 games |
| 2026-11-15 11:26 PST | gate-397f540b-b2 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.050 | exit 0 | load 48.6 of 60 mean, peak 8.0 GB | replay batch 2 at 397f540b, 40 workers, 5000 of 5000 games |
| 2026-11-15 11:27 PST | gate-397f540b-b4 | c3d-highcpu-60 | us-west1-c | 0.129 | 0.070 | exit 0 | load 69.3 of 60 mean, peak 8.9 GB | replay batch 4 at 397f540b, 40 workers, 5000 of 5000 games |
| 2026-11-15 11:32 PST | gate-397f540b-b7 | c3d-highcpu-60 | us-central1-a | 0.232 | 0.126 | exit 0 | load 68.0 of 60 mean, peak 11.3 GB | replay batch 7 at 397f540b, 40 workers, 3000 of 3000 games |
| 2026-11-15 11:36 PST | gate-397f540b-b8 | c3d-highcpu-60 | us-west1-a | 0.265 | 0.143 | exit 0 | load 67.5 of 60 mean, peak 13.8 GB | replay batch 8 at 397f540b, 40 workers, 3000 of 3000 games |
| 2026-11-15 11:33 PST | gate-397f540b-b6 | c3d-highcpu-60 | us-east1-c | 0.336 | 0.182 | exit 0 | load 67.0 of 60 mean, peak 13.8 GB | replay batch 6 at 397f540b, 40 workers, 3000 of 3000 games |
| 2026-11-15 11:46 PST | gate-397f540b-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 63.3 of 60 mean, peak 10.1 GB | replay batch 11 at 397f540b, 40 workers, 1500 of 1500 games |
| 2026-11-15 11:31 PST | gate-397f540b-b5 | c3d-highcpu-60 | us-central1-a | 0.374 | 0.202 | exit 0 | load 67.3 of 60 mean, peak 13.9 GB | replay batch 5 at 397f540b, 40 workers, 3000 of 3000 games |
| 2026-11-15 11:54 PST | gate-397f540b-b15 | c3d-highcpu-60 | us-central1-c | 0.092 | 0.050 | exit 0 | load 47.2 of 60 mean, peak 9.6 GB | replay batch 15 at 397f540b, 40 workers, 618 of 618 games |
| 2026-11-15 11:53 PST | gate-397f540b-b12 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.067 | exit 0 | load 64.7 of 60 mean, peak 10.0 GB | replay batch 12 at 397f540b, 40 workers, 1500 of 1500 games |
| 2026-11-15 12:02 PST | gate-397f540b-b16 | c3d-highcpu-60 | us-west1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 397f540b, 40 workers, 106 of 106 games |
| 2026-11-15 12:00 PST | gate-397f540b-b20 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 45.9 of 60 mean, peak 10.5 GB | replay batch 20 at 397f540b, 40 workers, 605 of 605 games |
| 2026-11-15 12:05 PST | gate-397f540b-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 62.0 of 60 mean, peak 10.2 GB | replay batch pilots at 397f540b, 40 workers, 1353 of 1353 games |
| 2026-11-15 11:55 PST | gate-397f540b-b9 | c3d-highcpu-60 | us-east1-c | 0.302 | 0.163 | exit 0 | load 67.9 of 60 mean, peak 13.7 GB | replay batch 9 at 397f540b, 40 workers, 3000 of 3000 games |
| 2026-11-15 11:53 PST | gate-397f540b-b10 | c3d-highcpu-60 | us-central1-a | 0.406 | 0.220 | exit 0 | load 63.5 of 60 mean, peak 14.6 GB | replay batch 10 at 397f540b, 40 workers, 3000 of 3000 games |
| 2026-11-15 12:13 PST | gate-397f540b-b13 | c3d-highcpu-60 | us-central1-a | 0.126 | 0.068 | exit 0 | load 65.0 of 60 mean, peak 10.9 GB | replay batch 13 at 397f540b, 40 workers, 1500 of 1500 games |
| 2026-11-15 12:18 PST | gate-397f540b-b14 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 58.8 of 60 mean, peak 11.1 GB | replay batch 14 at 397f540b, 40 workers, 1500 of 1500 games |
| 2026-11-15 12:21 PST | gate-397f540b-b17 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | load 49.1 of 60 mean, peak 10.3 GB | replay batch 17 at 397f540b, 40 workers, 605 of 605 games |
| 2026-11-15 12:24 PST | gate-397f540b-b18 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | load 49.7 of 60 mean, peak 9.5 GB | replay batch 18 at 397f540b, 40 workers, 605 of 605 games |
| 2026-11-15 15:19 PST | gate-55ed6ee9-b1 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.051 | exit 0 | load 48.5 of 60 mean, peak 7.6 GB | replay batch 1 at 55ed6ee9, 40 workers, 5000 of 5000 games |
| 2026-11-15 15:20 PST | gate-55ed6ee9-b2 | c3d-highcpu-60 | us-east1-c | 0.094 | 0.051 | exit 0 | load 52.6 of 60 mean, peak 7.6 GB | replay batch 2 at 55ed6ee9, 40 workers, 5000 of 5000 games |
| 2026-11-15 15:21 PST | gate-55ed6ee9-b3 | c3d-highcpu-60 | us-west1-a | 0.094 | 0.051 | exit 0 | load 50.2 of 60 mean, peak 7.4 GB | replay batch 3 at 55ed6ee9, 40 workers, 5000 of 5000 games |
| 2026-11-15 15:20 PST | gate-55ed6ee9-b4 | c3d-highcpu-60 | us-central1-a | 0.167 | 0.090 | exit 0 | load 70.8 of 60 mean, peak 9.0 GB | replay batch 4 at 55ed6ee9, 40 workers, 5000 of 5000 games |
| 2026-11-15 15:28 PST | gate-55ed6ee9-b7 | c3d-highcpu-60 | us-west1-a | 0.233 | 0.126 | exit 0 | load 66.8 of 60 mean, peak 11.4 GB | replay batch 7 at 55ed6ee9, 40 workers, 3000 of 3000 games |
| 2026-11-15 15:30 PST | gate-55ed6ee9-b8 | c3d-highcpu-60 | us-central1-a | 0.268 | 0.145 | exit 0 | load 68.2 of 60 mean, peak 14.0 GB | replay batch 8 at 55ed6ee9, 40 workers, 3000 of 3000 games |
| 2026-11-15 15:27 PST | gate-55ed6ee9-b6 | c3d-highcpu-60 | us-east1-c | 0.344 | 0.186 | exit 0 | load 67.3 of 60 mean, peak 15.4 GB | replay batch 6 at 55ed6ee9, 40 workers, 3000 of 3000 games |
| 2026-11-15 15:43 PST | gate-55ed6ee9-b11 | c3d-highcpu-60 | us-west1-a | 0.092 | 0.050 | exit 0 | load 59.5 of 60 mean, peak 10.1 GB | replay batch 11 at 55ed6ee9, 40 workers, 1500 of 1500 games |
| 2026-11-15 15:26 PST | gate-55ed6ee9-b5 | c3d-highcpu-60 | us-central1-a | 0.378 | 0.205 | exit 0 | load 66.2 of 60 mean, peak 16.0 GB | replay batch 5 at 55ed6ee9, 40 workers, 3000 of 3000 games |
| 2026-11-15 15:47 PST | gate-55ed6ee9-b12 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 61.5 of 60 mean, peak 10.4 GB | replay batch 12 at 55ed6ee9, 40 workers, 1500 of 1500 games |
| 2026-11-15 15:49 PST | gate-55ed6ee9-b15 | c3d-highcpu-60 | us-east1-b | 0.095 | 0.051 | exit 0 | load 47.9 of 60 mean, peak 10.5 GB | replay batch 15 at 55ed6ee9, 40 workers, 618 of 618 games |
| 2026-11-15 15:53 PST | gate-55ed6ee9-b16 | c3d-highcpu-60 | us-central1-a | 0.058 | 0.031 | exit 0 | not sampled | replay batch 16 at 55ed6ee9, 40 workers, 106 of 106 games |
| 2026-11-15 15:56 PST | gate-55ed6ee9-b20 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 49.8 of 60 mean, peak 10.0 GB | replay batch 20 at 55ed6ee9, 40 workers, 605 of 605 games |
| 2026-11-15 15:57 PST | gate-55ed6ee9-pilots | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 59.7 of 60 mean, peak 10.5 GB | replay batch pilots at 55ed6ee9, 40 workers, 1353 of 1353 games |
| 2026-11-15 15:50 PST | gate-55ed6ee9-b9 | c3d-highcpu-60 | us-west1-a | 0.280 | 0.152 | exit 0 | load 67.7 of 60 mean, peak 12.7 GB | replay batch 9 at 55ed6ee9, 40 workers, 3000 of 3000 games |
| 2026-11-15 15:48 PST | gate-55ed6ee9-b10 | c3d-highcpu-60 | us-central1-c | 0.358 | 0.194 | exit 0 | load 63.4 of 60 mean, peak 15.8 GB | replay batch 10 at 55ed6ee9, 40 workers, 3000 of 3000 games |
| 2026-11-15 16:07 PST | gate-55ed6ee9-b13 | c3d-highcpu-60 | us-central1-a | 0.132 | 0.071 | exit 0 | load 66.1 of 60 mean, peak 10.8 GB | replay batch 13 at 55ed6ee9, 40 workers, 1500 of 1500 games |
| 2026-11-15 16:11 PST | gate-55ed6ee9-b14 | c3d-highcpu-60 | us-central1-a | 0.131 | 0.071 | exit 0 | load 63.5 of 60 mean, peak 10.9 GB | replay batch 14 at 55ed6ee9, 40 workers, 1500 of 1500 games |
| 2026-11-15 16:16 PST | gate-55ed6ee9-b17 | c3d-highcpu-60 | us-central1-a | 0.059 | 0.032 | exit 0 | load 47.9 of 60 mean, peak 10.2 GB | replay batch 17 at 55ed6ee9, 40 workers, 605 of 605 games |
| 2026-11-15 16:19 PST | gate-55ed6ee9-b18 | c3d-highcpu-60 | us-central1-a | 0.059 | 0.032 | exit 0 | load 46.7 of 60 mean, peak 10.1 GB | replay batch 18 at 55ed6ee9, 40 workers, 605 of 605 games |
| 2026-11-15 17:27 PST | gate-e6cbbf3f-b1 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.049 | exit 0 | load 51.6 of 60 mean, peak 7.2 GB | replay batch 1 at e6cbbf3f, 40 workers, 5000 of 5000 games |
| 2026-11-15 17:27 PST | gate-e6cbbf3f-b2 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.049 | exit 0 | load 51.1 of 60 mean, peak 7.4 GB | replay batch 2 at e6cbbf3f, 40 workers, 5000 of 5000 games |
| 2026-11-15 17:28 PST | gate-e6cbbf3f-b3 | c3d-highcpu-60 | us-west1-a | 0.093 | 0.050 | exit 0 | load 51.6 of 60 mean, peak 8.0 GB | replay batch 3 at e6cbbf3f, 40 workers, 5000 of 5000 games |
| 2026-11-15 17:27 PST | gate-e6cbbf3f-b4 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 69.5 of 60 mean, peak 8.4 GB | replay batch 4 at e6cbbf3f, 40 workers, 5000 of 5000 games |
| 2026-11-15 17:34 PST | gate-e6cbbf3f-b7 | c3d-highcpu-60 | us-west1-a | 0.216 | 0.117 | exit 0 | load 66.2 of 60 mean, peak 11.5 GB | replay batch 7 at e6cbbf3f, 40 workers, 3000 of 3000 games |
| 2026-11-15 17:35 PST | gate-e6cbbf3f-b8 | c3d-highcpu-60 | us-central1-a | 0.253 | 0.137 | exit 0 | load 67.6 of 60 mean, peak 13.3 GB | replay batch 8 at e6cbbf3f, 40 workers, 3000 of 3000 games |
| 2026-11-15 17:50 PST | gate-e6cbbf3f-b11 | c3d-highcpu-60 | us-west1-a | 0.103 | 0.056 | exit 0 | load 58.4 of 60 mean, peak 10.1 GB | replay batch 11 at e6cbbf3f, 40 workers, 1500 of 1500 games |
| 2026-11-15 17:34 PST | gate-e6cbbf3f-b6 | c3d-highcpu-60 | us-east1-c | 0.374 | 0.202 | exit 0 | load 67.3 of 60 mean, peak 13.3 GB | replay batch 6 at e6cbbf3f, 40 workers, 3000 of 3000 games |
| 2026-11-15 17:33 PST | gate-e6cbbf3f-b5 | c3d-highcpu-60 | us-central1-a | 0.391 | 0.212 | exit 0 | load 67.8 of 60 mean, peak 13.3 GB | replay batch 5 at e6cbbf3f, 40 workers, 3000 of 3000 games |
| 2026-11-15 17:51 PST | gate-e6cbbf3f-b12 | c3d-highcpu-60 | us-central1-a | 0.111 | 0.060 | exit 0 | load 61.0 of 60 mean, peak 10.2 GB | replay batch 12 at e6cbbf3f, 40 workers, 1500 of 1500 games |
| 2026-11-15 17:57 PST | gate-e6cbbf3f-b15 | c3d-highcpu-60 | us-central1-a | 0.060 | 0.032 | exit 0 | load 49.9 of 60 mean, peak 10.8 GB | replay batch 15 at e6cbbf3f, 40 workers, 618 of 618 games |
| 2026-11-15 17:59 PST | gate-e6cbbf3f-b16 | c3d-highcpu-60 | us-west1-a | 0.060 | 0.032 | exit 0 | not sampled | replay batch 16 at e6cbbf3f, 40 workers, 106 of 106 games |
| 2026-11-15 18:01 PST | gate-e6cbbf3f-b20 | c3d-highcpu-60 | us-central1-a | 0.059 | 0.032 | exit 0 | load 47.8 of 60 mean, peak 10.2 GB | replay batch 20 at e6cbbf3f, 40 workers, 605 of 605 games |
| 2026-11-15 18:05 PST | gate-e6cbbf3f-pilots | c3d-highcpu-60 | us-west1-c | 0.093 | 0.050 | exit 0 | load 59.5 of 60 mean, peak 9.8 GB | replay batch pilots at e6cbbf3f, 40 workers, 1353 of 1353 games |
| 2026-11-15 17:58 PST | gate-e6cbbf3f-b9 | c3d-highcpu-60 | us-east1-b | 0.285 | 0.154 | exit 0 | load 68.2 of 60 mean, peak 14.9 GB | replay batch 9 at e6cbbf3f, 40 workers, 3000 of 3000 games |
| 2026-11-15 17:57 PST | gate-e6cbbf3f-b10 | c3d-highcpu-60 | us-central1-c | 0.404 | 0.219 | exit 0 | load 63.6 of 60 mean, peak 15.8 GB | replay batch 10 at e6cbbf3f, 40 workers, 3000 of 3000 games |
| 2026-11-15 18:16 PST | gate-e6cbbf3f-b13 | c3d-highcpu-60 | us-central1-a | 0.138 | 0.075 | exit 0 | load 67.2 of 60 mean, peak 10.6 GB | replay batch 13 at e6cbbf3f, 40 workers, 1500 of 1500 games |
| 2026-11-15 18:25 PST | gate-e6cbbf3f-b17 | c3d-highcpu-60 | us-central1-a | 0.063 | 0.034 | exit 0 | load 51.0 of 60 mean, peak 9.7 GB | replay batch 17 at e6cbbf3f, 40 workers, 605 of 605 games |
| 2026-11-15 18:23 PST | gate-e6cbbf3f-b14 | c3d-highcpu-60 | us-central1-a | 0.101 | 0.055 | exit 0 | load 61.6 of 60 mean, peak 10.5 GB | replay batch 14 at e6cbbf3f, 40 workers, 1500 of 1500 games |
| 2026-11-15 18:30 PST | gate-e6cbbf3f-b18 | c3d-highcpu-60 | us-central1-a | 0.060 | 0.032 | exit 0 | load 50.2 of 60 mean, peak 9.5 GB | replay batch 18 at e6cbbf3f, 40 workers, 605 of 605 games |
| 2026-11-15 18:57 PST | gate-784c4715-b1 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.049 | exit 0 | load 48.2 of 60 mean, peak 7.7 GB | replay batch 1 at 784c4715, 40 workers, 5000 of 5000 games |
| 2026-11-15 18:57 PST | gate-784c4715-b2 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.049 | exit 0 | load 49.1 of 60 mean, peak 7.4 GB | replay batch 2 at 784c4715, 40 workers, 5000 of 5000 games |
| 2026-11-15 18:58 PST | gate-784c4715-b3 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 50.2 of 60 mean, peak 7.8 GB | replay batch 3 at 784c4715, 40 workers, 5000 of 5000 games |
| 2026-11-15 18:57 PST | gate-784c4715-b4 | c3d-highcpu-60 | us-east1-c | 0.161 | 0.087 | exit 0 | load 70.2 of 60 mean, peak 8.7 GB | replay batch 4 at 784c4715, 40 workers, 5000 of 5000 games |
| 2026-11-15 19:04 PST | gate-784c4715-b7 | c3d-highcpu-60 | us-west1-a | 0.237 | 0.128 | exit 0 | load 69.6 of 60 mean, peak 12.3 GB | replay batch 7 at 784c4715, 40 workers, 3000 of 3000 games |
| 2026-11-15 19:03 PST | gate-784c4715-b6 | c3d-highcpu-60 | us-central1-a | 0.357 | 0.193 | exit 0 | load 67.1 of 60 mean, peak 13.7 GB | replay batch 6 at 784c4715, 40 workers, 3000 of 3000 games |
| 2026-11-15 19:08 PST | gate-784c4715-b8 | c3d-highcpu-60 | us-east1-c | 0.287 | 0.155 | exit 0 | load 67.3 of 60 mean, peak 13.5 GB | replay batch 8 at 784c4715, 40 workers, 3000 of 3000 games |
| 2026-11-15 19:03 PST | gate-784c4715-b5 | c3d-highcpu-60 | us-central1-a | 0.390 | 0.211 | exit 0 | load 67.4 of 60 mean, peak 15.2 GB | replay batch 5 at 784c4715, 40 workers, 3000 of 3000 games |
| 2026-11-15 19:21 PST | gate-784c4715-b11 | c3d-highcpu-60 | us-west1-a | 0.100 | 0.054 | exit 0 | load 62.0 of 60 mean, peak 9.8 GB | replay batch 11 at 784c4715, 40 workers, 1500 of 1500 games |
| 2026-11-15 19:28 PST | gate-784c4715-b15 | c3d-highcpu-60 | us-west1-a | 0.059 | 0.032 | exit 0 | load 49.6 of 60 mean, peak 9.9 GB | replay batch 15 at 784c4715, 40 workers, 618 of 618 games |
| 2026-11-15 19:26 PST | gate-784c4715-b12 | c3d-highcpu-60 | us-central1-c | 0.102 | 0.055 | exit 0 | load 61.2 of 60 mean, peak 10.3 GB | replay batch 12 at 784c4715, 40 workers, 1500 of 1500 games |
| 2026-11-15 19:33 PST | gate-784c4715-b16 | c3d-highcpu-60 | us-central1-a | 0.057 | 0.031 | exit 0 | not sampled | replay batch 16 at 784c4715, 40 workers, 106 of 106 games |
| 2026-11-15 19:33 PST | gate-784c4715-b20 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.051 | exit 0 | load 50.1 of 60 mean, peak 9.8 GB | replay batch 20 at 784c4715, 40 workers, 605 of 605 games |
| 2026-11-15 19:37 PST | gate-784c4715-pilots | c3d-highcpu-60 | us-central1-a | 0.090 | 0.049 | exit 0 | load 58.7 of 60 mean, peak 10.7 GB | replay batch pilots at 784c4715, 40 workers, 1353 of 1353 games |
| 2026-11-15 19:28 PST | gate-784c4715-b9 | c3d-highcpu-60 | us-east1-b | 0.277 | 0.150 | exit 0 | load 69.4 of 60 mean, peak 13.5 GB | replay batch 9 at 784c4715, 40 workers, 3000 of 3000 games |
| 2026-11-15 19:25 PST | gate-784c4715-b10 | c3d-highcpu-60 | us-central1-a | 0.385 | 0.208 | exit 0 | load 64.0 of 60 mean, peak 16.0 GB | replay batch 10 at 784c4715, 40 workers, 3000 of 3000 games |
| 2026-11-15 19:45 PST | gate-784c4715-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.8 of 60 mean, peak 9.7 GB | replay batch 13 at 784c4715, 40 workers, 1500 of 1500 games |
| 2026-11-15 19:49 PST | gate-784c4715-b14 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 58.7 of 60 mean, peak 10.7 GB | replay batch 14 at 784c4715, 40 workers, 1500 of 1500 games |
| 2026-11-15 19:53 PST | gate-784c4715-b17 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | load 47.3 of 60 mean, peak 9.5 GB | replay batch 17 at 784c4715, 40 workers, 605 of 605 games |
| 2026-11-15 19:55 PST | gate-784c4715-b18 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | load 45.6 of 60 mean, peak 9.5 GB | replay batch 18 at 784c4715, 40 workers, 605 of 605 games |
| 2026-11-15 21:16 PST | gate-e0db71cb-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 48.9 of 60 mean, peak 8.0 GB | replay batch 2 at e0db71cb, 40 workers, 5000 of 5000 games |
| 2026-11-15 21:16 PST | gate-e0db71cb-b1 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.049 | exit 0 | load 50.6 of 60 mean, peak 7.6 GB | replay batch 1 at e0db71cb, 40 workers, 5000 of 5000 games |
| 2026-11-15 21:17 PST | gate-e0db71cb-b3 | c3d-highcpu-60 | us-west1-a | 0.090 | 0.049 | exit 0 | load 49.7 of 60 mean, peak 7.8 GB | replay batch 3 at e0db71cb, 40 workers, 5000 of 5000 games |
| 2026-11-15 21:16 PST | gate-e0db71cb-b4 | c3d-highcpu-60 | us-east1-b | 0.125 | 0.068 | exit 0 | load 68.1 of 60 mean, peak 8.8 GB | replay batch 4 at e0db71cb, 40 workers, 5000 of 5000 games |
| 2026-11-15 21:24 PST | gate-e0db71cb-b7 | c3d-highcpu-60 | us-west1-a | 0.232 | 0.126 | exit 0 | load 66.9 of 60 mean, peak 11.5 GB | replay batch 7 at e0db71cb, 40 workers, 3000 of 3000 games |
| 2026-11-15 21:25 PST | gate-e0db71cb-b8 | c3d-highcpu-60 | us-east1-c | 0.266 | 0.144 | exit 0 | load 67.9 of 60 mean, peak 12.5 GB | replay batch 8 at e0db71cb, 40 workers, 3000 of 3000 games |
| 2026-11-15 21:21 PST | gate-e0db71cb-b6 | c3d-highcpu-60 | us-central1-a | 0.338 | 0.183 | exit 0 | load 67.3 of 60 mean, peak 14.0 GB | replay batch 6 at e0db71cb, 40 workers, 3000 of 3000 games |
| 2026-11-15 21:22 PST | gate-e0db71cb-b5 | c3d-highcpu-60 | us-central1-a | 0.372 | 0.201 | exit 0 | load 67.8 of 60 mean, peak 14.5 GB | replay batch 5 at e0db71cb, 40 workers, 3000 of 3000 games |
| 2026-11-15 21:39 PST | gate-e0db71cb-b11 | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 60.6 of 60 mean, peak 9.4 GB | replay batch 11 at e0db71cb, 40 workers, 1500 of 1500 games |
| 2026-11-15 21:45 PST | gate-e0db71cb-b15 | c3d-highcpu-60 | us-west1-a | 0.054 | 0.029 | exit 0 | load 48.2 of 60 mean, peak 10.3 GB | replay batch 15 at e0db71cb, 40 workers, 618 of 618 games |
| 2026-11-15 21:42 PST | gate-e0db71cb-b12 | c3d-highcpu-60 | us-east1-b | 0.124 | 0.067 | exit 0 | load 63.8 of 60 mean, peak 10.9 GB | replay batch 12 at e0db71cb, 40 workers, 1500 of 1500 games |
| 2026-11-15 21:50 PST | gate-e0db71cb-b16 | c3d-highcpu-60 | us-west1-a | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at e0db71cb, 40 workers, 106 of 106 games |
| 2026-11-15 21:50 PST | gate-e0db71cb-b20 | c3d-highcpu-60 | us-east1-b | 0.090 | 0.049 | exit 0 | load 50.1 of 60 mean, peak 10.4 GB | replay batch 20 at e0db71cb, 40 workers, 605 of 605 games |
| 2026-11-15 21:55 PST | gate-e0db71cb-pilots | c3d-highcpu-60 | us-west1-a | 0.089 | 0.048 | exit 0 | load 58.0 of 60 mean, peak 10.2 GB | replay batch pilots at e0db71cb, 40 workers, 1353 of 1353 games |
| 2026-11-15 21:44 PST | gate-e0db71cb-b9 | c3d-highcpu-60 | us-central1-a | 0.266 | 0.144 | exit 0 | load 67.1 of 60 mean, peak 13.1 GB | replay batch 9 at e0db71cb, 40 workers, 3000 of 3000 games |
| 2026-11-15 21:42 PST | gate-e0db71cb-b10 | c3d-highcpu-60 | us-central1-a | 0.372 | 0.201 | exit 0 | load 63.7 of 60 mean, peak 14.6 GB | replay batch 10 at e0db71cb, 40 workers, 3000 of 3000 games |
| 2026-11-15 22:01 PST | gate-e0db71cb-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 66.9 of 60 mean, peak 10.2 GB | replay batch 13 at e0db71cb, 40 workers, 1500 of 1500 games |
| 2026-11-15 22:05 PST | gate-e0db71cb-b14 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.070 | exit 0 | load 61.8 of 60 mean, peak 10.1 GB | replay batch 14 at e0db71cb, 40 workers, 1500 of 1500 games |
| 2026-11-15 22:08 PST | gate-e0db71cb-b17 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 46.6 of 60 mean, peak 9.5 GB | replay batch 17 at e0db71cb, 40 workers, 605 of 605 games |
| 2026-11-15 22:13 PST | gate-e0db71cb-b18 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | exit 0 | load 48.1 of 60 mean, peak 9.4 GB | replay batch 18 at e0db71cb, 40 workers, 605 of 605 games |
| 2026-11-15 23:31 PST | gate-358718ca-b1 | c3d-highcpu-60 | us-central1-a | 0.108 | 0.058 | exit 0 | load 48.3 of 60 mean, peak 7.6 GB | replay batch 1 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-15 23:31 PST | gate-358718ca-b2 | c3d-highcpu-60 | us-central1-a | 0.109 | 0.059 | exit 0 | load 52.2 of 60 mean, peak 7.5 GB | replay batch 2 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-15 23:32 PST | gate-358718ca-b3 | c3d-highcpu-60 | us-west1-a | 0.110 | 0.060 | exit 0 | load 48.3 of 60 mean, peak 7.8 GB | replay batch 3 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-15 23:32 PST | gate-358718ca-b4 | c3d-highcpu-60 | us-east1-b | 0.151 | 0.082 | exit 0 | load 66.1 of 60 mean, peak 9.1 GB | replay batch 4 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-15 23:41 PST | gate-358718ca-b7 | c3d-highcpu-60 | us-east1-b | 0.226 | 0.122 | exit 0 | load 66.4 of 60 mean, peak 12.2 GB | replay batch 7 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-15 23:39 PST | gate-358718ca-b6 | c3d-highcpu-60 | us-central1-a | 0.311 | 0.168 | exit 0 | load 68.1 of 60 mean, peak 13.3 GB | replay batch 6 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-15 23:43 PST | gate-358718ca-b8 | c3d-highcpu-60 | us-west1-a | 0.270 | 0.146 | exit 0 | load 66.0 of 60 mean, peak 13.1 GB | replay batch 8 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-15 23:39 PST | gate-358718ca-b5 | c3d-highcpu-60 | us-central1-a | 0.351 | 0.190 | exit 0 | load 67.4 of 60 mean, peak 14.9 GB | replay batch 5 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-15 23:57 PST | gate-358718ca-b11 | c3d-highcpu-60 | us-east1-b | 0.109 | 0.059 | exit 0 | load 56.7 of 60 mean, peak 9.9 GB | replay batch 11 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 00:00 PST | gate-358718ca-b12 | c3d-highcpu-60 | us-central1-a | 0.106 | 0.057 | exit 0 | load 59.5 of 60 mean, peak 10.7 GB | replay batch 12 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 00:05 PST | gate-358718ca-b15 | c3d-highcpu-60 | us-east1-b | 0.059 | 0.032 | exit 0 | load 46.6 of 60 mean, peak 10.5 GB | replay batch 15 at 358718ca, 40 workers, 618 of 618 games |
| 2026-11-16 00:07 PST | gate-358718ca-b16 | c3d-highcpu-60 | us-central1-a | 0.058 | 0.031 | exit 0 | not sampled | replay batch 16 at 358718ca, 40 workers, 106 of 106 games |
| 2026-11-16 00:10 PST | gate-358718ca-b20 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.050 | exit 0 | load 47.6 of 60 mean, peak 10.3 GB | replay batch 20 at 358718ca, 40 workers, 605 of 605 games |
| 2026-11-16 00:11 PST | gate-358718ca-pilots | c3d-highcpu-60 | us-central1-a | 0.091 | 0.049 | exit 0 | load 57.6 of 60 mean, peak 10.1 GB | replay batch pilots at 358718ca, 40 workers, 1353 of 1353 games |
| 2026-11-16 00:03 PST | gate-358718ca-b9 | c3d-highcpu-60 | us-west1-a | 0.274 | 0.148 | exit 0 | load 68.6 of 60 mean, peak 13.2 GB | replay batch 9 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-15 23:58 PST | gate-358718ca-b10 | c3d-highcpu-60 | us-central1-a | 0.356 | 0.193 | exit 0 | load 64.2 of 60 mean, peak 15.6 GB | replay batch 10 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 00:20 PST | gate-358718ca-b13 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 61.0 of 60 mean, peak 11.4 GB | replay batch 13 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 00:20 PST | gate-358718ca-b14 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.049 | exit 0 | load 59.9 of 60 mean, peak 10.3 GB | replay batch 14 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 00:26 PST | gate-358718ca-b17 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.029 | exit 0 | load 44.8 of 60 mean, peak 9.8 GB | replay batch 17 at 358718ca, 40 workers, 605 of 605 games |
| 2026-11-16 00:26 PST | gate-358718ca-b18 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | load 47.3 of 60 mean, peak 10.0 GB | replay batch 18 at 358718ca, 40 workers, 605 of 605 games |
| 2026-11-16 00:58 PST | gate-bda6e0db-b1 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 49.3 of 60 mean, peak 7.6 GB | replay batch 1 at bda6e0db, 40 workers, 5000 of 5000 games |
| 2026-11-16 00:59 PST | gate-bda6e0db-b2 | c3d-highcpu-60 | us-east1-b | 0.095 | 0.051 | exit 0 | load 54.5 of 60 mean, peak 7.6 GB | replay batch 2 at bda6e0db, 40 workers, 5000 of 5000 games |
| 2026-11-16 00:59 PST | gate-bda6e0db-b3 | c3d-highcpu-60 | us-west1-a | 0.094 | 0.051 | exit 0 | load 50.4 of 60 mean, peak 7.8 GB | replay batch 3 at bda6e0db, 40 workers, 5000 of 5000 games |
| 2026-11-16 00:58 PST | gate-bda6e0db-b4 | c3d-highcpu-60 | us-central1-a | 0.135 | 0.073 | exit 0 | load 67.7 of 60 mean, peak 8.9 GB | replay batch 4 at bda6e0db, 40 workers, 5000 of 5000 games |
| 2026-11-16 01:07 PST | gate-bda6e0db-b7 | c3d-highcpu-60 | us-west1-a | 0.234 | 0.127 | exit 0 | load 67.5 of 60 mean, peak 11.8 GB | replay batch 7 at bda6e0db, 40 workers, 3000 of 3000 games |
| 2026-11-16 01:07 PST | gate-bda6e0db-b8 | c3d-highcpu-60 | us-central1-a | 0.270 | 0.146 | exit 0 | load 64.8 of 60 mean, peak 13.2 GB | replay batch 8 at bda6e0db, 40 workers, 3000 of 3000 games |
| 2026-11-16 01:05 PST | gate-bda6e0db-b5 | c3d-highcpu-60 | us-central1-a | 0.354 | 0.192 | exit 0 | load 67.7 of 60 mean, peak 15.4 GB | replay batch 5 at bda6e0db, 40 workers, 3000 of 3000 games |
| 2026-11-16 01:06 PST | gate-bda6e0db-b6 | c3d-highcpu-60 | us-east1-b | 0.394 | 0.213 | exit 0 | load 67.9 of 60 mean, peak 13.7 GB | replay batch 6 at bda6e0db, 40 workers, 3000 of 3000 games |
| 2026-11-16 01:24 PST | gate-bda6e0db-b11 | c3d-highcpu-60 | us-west1-a | 0.107 | 0.058 | exit 0 | load 59.6 of 60 mean, peak 9.6 GB | replay batch 11 at bda6e0db, 40 workers, 1500 of 1500 games |
| 2026-11-16 01:25 PST | gate-bda6e0db-b12 | c3d-highcpu-60 | us-central1-a | 0.112 | 0.061 | exit 0 | load 59.1 of 60 mean, peak 9.9 GB | replay batch 12 at bda6e0db, 40 workers, 1500 of 1500 games |
| 2026-11-16 01:32 PST | gate-bda6e0db-b15 | c3d-highcpu-60 | us-central1-b | 0.072 | 0.039 | exit 0 | load 45.8 of 60 mean, peak 10.2 GB | replay batch 15 at bda6e0db, 40 workers, 618 of 618 games |
| 2026-11-16 01:35 PST | gate-bda6e0db-b16 | c3d-highcpu-60 | us-west1-a | 0.077 | 0.042 | exit 0 | not sampled | replay batch 16 at bda6e0db, 40 workers, 106 of 106 games |
| 2026-11-16 01:38 PST | gate-bda6e0db-b20 | c3d-highcpu-60 | us-central1-b | 0.070 | 0.038 | exit 0 | load 45.7 of 60 mean, peak 10.3 GB | replay batch 20 at bda6e0db, 40 workers, 605 of 605 games |
| 2026-11-16 01:27 PST | gate-bda6e0db-b9 | c3d-highcpu-60 | us-central1-a | 0.284 | 0.154 | exit 0 | load 65.0 of 60 mean, peak 14.0 GB | replay batch 9 at bda6e0db, 40 workers, 3000 of 3000 games |
| 2026-11-16 01:42 PST | gate-bda6e0db-pilots | c3d-highcpu-60 | us-west1-a | 0.118 | 0.064 | exit 0 | load 60.6 of 60 mean, peak 10.2 GB | replay batch pilots at bda6e0db, 40 workers, 1353 of 1353 games |
| 2026-11-16 01:45 PST | gate-bda6e0db-b13 | c3d-highcpu-60 | us-central1-a | 0.117 | 0.063 | exit 0 | load 64.5 of 60 mean, peak 10.7 GB | replay batch 13 at bda6e0db, 40 workers, 1500 of 1500 games |
| 2026-11-16 01:32 PST | gate-bda6e0db-b10 | c3d-highcpu-60 | us-east1-b | 0.413 | 0.224 | exit 0 | load 66.0 of 60 mean, peak 15.0 GB | replay batch 10 at bda6e0db, 40 workers, 3000 of 3000 games |
| 2026-11-16 01:54 PST | gate-bda6e0db-b17 | c3d-highcpu-60 | us-central1-a | 0.074 | 0.040 | exit 0 | load 48.2 of 60 mean, peak 10.4 GB | replay batch 17 at bda6e0db, 40 workers, 605 of 605 games |
| 2026-11-16 02:00 PST | gate-358718ca-b2 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 2 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-16 02:01 PST | gate-358718ca-b4 | c3d-highcpu-60 | us-east1-b | 0.011 | 0.006 | exit 0 | not sampled | replay batch 4 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-16 02:01 PST | gate-358718ca-b3 | c3d-highcpu-60 | us-west1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 3 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-16 02:01 PST | gate-358718ca-b1 | c3d-highcpu-60 | us-west1-a | 0.011 | 0.006 | exit 0 | not sampled | replay batch 1 at 358718ca, 40 workers, 5000 of 5000 games |
| 2026-11-16 02:01 PST | gate-358718ca-b6 | c3d-highcpu-60 | us-central1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 6 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 02:02 PST | gate-358718ca-b5 | c3d-highcpu-60 | us-central1-b | 0.013 | 0.007 | exit 0 | not sampled | replay batch 5 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 02:02 PST | gate-358718ca-b8 | c3d-highcpu-60 | us-east1-b | 0.019 | 0.010 | exit 0 | not sampled | replay batch 8 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 02:03 PST | gate-358718ca-b7 | c3d-highcpu-60 | us-west1-a | 0.021 | 0.011 | exit 0 | not sampled | replay batch 7 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 02:03 PST | gate-358718ca-b9 | c3d-highcpu-60 | us-central1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 9 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 02:03 PST | gate-358718ca-b10 | c3d-highcpu-60 | us-west1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 10 at 358718ca, 40 workers, 3000 of 3000 games |
| 2026-11-16 02:04 PST | gate-358718ca-b12 | c3d-highcpu-60 | us-west1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 12 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 01:59 PST | gate-bda6e0db-b14 | c3d-highcpu-60 | us-central1-a | 0.113 | 0.061 | exit 0 | load 61.1 of 60 mean, peak 10.8 GB | replay batch 14 at bda6e0db, 40 workers, 1500 of 1500 games |
| 2026-11-16 02:05 PST | gate-358718ca-b11 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 11 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 02:05 PST | gate-358718ca-b13 | c3d-highcpu-60 | us-east1-b | 0.012 | 0.006 | exit 0 | not sampled | replay batch 13 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 02:06 PST | gate-358718ca-b16 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 16 at 358718ca, 40 workers, 106 of 106 games |
| 2026-11-16 02:06 PST | gate-358718ca-b14 | c3d-highcpu-60 | us-west1-a | 0.018 | 0.010 | exit 0 | not sampled | replay batch 14 at 358718ca, 40 workers, 1500 of 1500 games |
| 2026-11-16 02:06 PST | gate-358718ca-b15 | c3d-highcpu-60 | us-central1-a | 0.019 | 0.010 | exit 0 | not sampled | replay batch 15 at 358718ca, 40 workers, 618 of 618 games |
| 2026-11-16 02:07 PST | gate-358718ca-b17 | c3d-highcpu-60 | us-central1-c | 0.013 | 0.007 | exit 0 | not sampled | replay batch 17 at 358718ca, 40 workers, 605 of 605 games |
| 2026-11-16 02:08 PST | gate-358718ca-pilots | c3d-highcpu-60 | us-east1-b | 0.019 | 0.010 | exit 0 | not sampled | replay batch pilots at 358718ca, 40 workers, 1353 of 1353 games |
| 2026-11-16 02:08 PST | gate-358718ca-b18 | c3d-highcpu-60 | us-central1-f | 0.019 | 0.010 | exit 0 | not sampled | replay batch 18 at 358718ca, 40 workers, 605 of 605 games |
| 2026-11-16 02:09 PST | gate-358718ca-b20 | c3d-highcpu-60 | us-west1-a | 0.020 | 0.011 | exit 0 | not sampled | replay batch 20 at 358718ca, 40 workers, 605 of 605 games |
| 2026-11-16 02:07 PST | gate-bda6e0db-b18 | c3d-highcpu-60 | us-central1-c | 0.070 | 0.038 | exit 0 | load 47.8 of 60 mean, peak 10.1 GB | replay batch 18 at bda6e0db, 40 workers, 605 of 605 games |
| 2026-11-16 03:47 PST | gate-64669211-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 53.6 of 60 mean, peak 7.0 GB | replay batch 2 at 64669211, 40 workers, 5000 of 5000 games |
| 2026-11-16 03:48 PST | gate-64669211-b3 | c3d-highcpu-60 | us-east1-b | 0.088 | 0.048 | exit 0 | load 51.8 of 60 mean, peak 8.1 GB | replay batch 3 at 64669211, 40 workers, 5000 of 5000 games |
| 2026-11-16 03:48 PST | gate-64669211-b1 | c3d-highcpu-60 | us-west1-a | 0.090 | 0.049 | exit 0 | load 49.3 of 60 mean, peak 8.1 GB | replay batch 1 at 64669211, 40 workers, 5000 of 5000 games |
| 2026-11-16 03:47 PST | gate-64669211-b4 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.7 of 60 mean, peak 8.8 GB | replay batch 4 at 64669211, 40 workers, 5000 of 5000 games |
| 2026-11-16 03:54 PST | gate-64669211-b7 | c3d-highcpu-60 | us-east1-b | 0.229 | 0.124 | exit 0 | load 69.0 of 60 mean, peak 12.0 GB | replay batch 7 at 64669211, 40 workers, 3000 of 3000 games |
| 2026-11-16 03:55 PST | gate-64669211-b8 | c3d-highcpu-60 | us-central1-a | 0.298 | 0.161 | exit 0 | load 68.1 of 60 mean, peak 13.5 GB | replay batch 8 at 64669211, 40 workers, 3000 of 3000 games |
| 2026-11-16 03:53 PST | gate-64669211-b6 | c3d-highcpu-60 | us-central1-a | 0.333 | 0.180 | exit 0 | load 67.1 of 60 mean, peak 13.9 GB | replay batch 6 at 64669211, 40 workers, 3000 of 3000 games |
| 2026-11-16 03:55 PST | gate-64669211-b5 | c3d-highcpu-60 | us-west1-a | 0.333 | 0.180 | exit 0 | load 67.0 of 60 mean, peak 15.4 GB | replay batch 5 at 64669211, 40 workers, 3000 of 3000 games |
| 2026-11-16 04:09 PST | gate-64669211-b11 | c3d-highcpu-60 | us-east1-b | 0.124 | 0.067 | exit 0 | load 63.0 of 60 mean, peak 10.6 GB | replay batch 11 at 64669211, 40 workers, 1500 of 1500 games |
| 2026-11-16 04:13 PST | gate-64669211-b12 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 63.1 of 60 mean, peak 10.7 GB | replay batch 12 at 64669211, 40 workers, 1500 of 1500 games |
| 2026-11-16 04:17 PST | gate-64669211-b15 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.048 | exit 0 | load 47.1 of 60 mean, peak 10.0 GB | replay batch 15 at 64669211, 40 workers, 618 of 618 games |
| 2026-11-16 04:21 PST | gate-64669211-b16 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | not sampled | replay batch 16 at 64669211, 40 workers, 106 of 106 games |
| 2026-11-16 04:23 PST | gate-64669211-b20 | c3d-highcpu-60 | us-east1-c | 0.054 | 0.029 | exit 0 | load 52.3 of 60 mean, peak 10.7 GB | replay batch 20 at 64669211, 40 workers, 605 of 605 games |
| 2026-11-16 04:16 PST | gate-64669211-b9 | c3d-highcpu-60 | us-west1-a | 0.263 | 0.142 | exit 0 | load 67.7 of 60 mean, peak 13.2 GB | replay batch 9 at 64669211, 40 workers, 3000 of 3000 games |
| 2026-11-16 04:25 PST | gate-64669211-pilots | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 64.6 of 60 mean, peak 11.5 GB | replay batch pilots at 64669211, 40 workers, 1353 of 1353 games |
| 2026-11-16 04:13 PST | gate-64669211-b10 | c3d-highcpu-60 | us-central1-a | 0.403 | 0.218 | exit 0 | load 63.7 of 60 mean, peak 15.9 GB | replay batch 10 at 64669211, 40 workers, 3000 of 3000 games |
| 2026-11-16 04:32 PST | gate-64669211-b13 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 69.2 of 60 mean, peak 10.3 GB | replay batch 13 at 64669211, 40 workers, 1500 of 1500 games |
| 2026-11-16 04:38 PST | gate-64669211-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 65.9 of 60 mean, peak 10.7 GB | replay batch 14 at 64669211, 40 workers, 1500 of 1500 games |
| 2026-11-16 04:40 PST | gate-64669211-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.048 | exit 0 | load 48.0 of 60 mean, peak 9.4 GB | replay batch 17 at 64669211, 40 workers, 605 of 605 games |
| 2026-11-16 04:46 PST | gate-64669211-b18 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.029 | exit 0 | load 47.8 of 60 mean, peak 9.6 GB | replay batch 18 at 64669211, 40 workers, 605 of 605 games |
| 2026-11-16 06:52 PST | gate-3b637355-b1 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 51.3 of 60 mean, peak 7.6 GB | replay batch 1 at 3b637355, 40 workers, 5000 of 5000 games |
| 2026-11-16 06:52 PST | gate-3b637355-b3 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 61.1 of 60 mean, peak 7.8 GB | replay batch 3 at 3b637355, 40 workers, 5000 of 5000 games |
| 2026-11-16 06:53 PST | gate-3b637355-b2 | c3d-highcpu-60 | us-west1-a | 0.092 | 0.050 | exit 0 | load 55.7 of 60 mean, peak 7.2 GB | replay batch 2 at 3b637355, 40 workers, 5000 of 5000 games |
| 2026-11-16 06:52 PST | gate-3b637355-b4 | c3d-highcpu-60 | us-east1-c | 0.129 | 0.070 | exit 0 | load 68.1 of 60 mean, peak 9.0 GB | replay batch 4 at 3b637355, 40 workers, 5000 of 5000 games |
| 2026-11-16 06:58 PST | gate-3b637355-b7 | c3d-highcpu-60 | us-central1-a | 0.231 | 0.125 | exit 0 | load 70.2 of 60 mean, peak 11.6 GB | replay batch 7 at 3b637355, 40 workers, 3000 of 3000 games |
| 2026-11-16 07:02 PST | gate-3b637355-b8 | c3d-highcpu-60 | us-east1-c | 0.264 | 0.143 | exit 0 | load 68.0 of 60 mean, peak 13.2 GB | replay batch 8 at 3b637355, 40 workers, 3000 of 3000 games |
| 2026-11-16 07:12 PST | gate-3b637355-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.067 | exit 0 | load 68.8 of 60 mean, peak 9.9 GB | replay batch 11 at 3b637355, 40 workers, 1500 of 1500 games |
| 2026-11-16 07:00 PST | gate-3b637355-b6 | c3d-highcpu-60 | us-west1-a | 0.335 | 0.181 | exit 0 | load 67.8 of 60 mean, peak 14.5 GB | replay batch 6 at 3b637355, 40 workers, 3000 of 3000 games |
| 2026-11-16 06:58 PST | gate-3b637355-b5 | c3d-highcpu-60 | us-central1-a | 0.409 | 0.221 | exit 0 | load 67.3 of 60 mean, peak 13.6 GB | replay batch 5 at 3b637355, 40 workers, 3000 of 3000 games |
| 2026-11-16 07:20 PST | gate-3b637355-b15 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.050 | exit 0 | load 46.3 of 60 mean, peak 10.1 GB | replay batch 15 at 3b637355, 40 workers, 618 of 618 games |
| 2026-11-16 07:19 PST | gate-3b637355-b12 | c3d-highcpu-60 | us-east1-b | 0.128 | 0.069 | exit 0 | load 59.9 of 60 mean, peak 9.9 GB | replay batch 12 at 3b637355, 40 workers, 1500 of 1500 games |
| 2026-11-16 07:28 PST | gate-3b637355-b16 | c3d-highcpu-60 | us-east1-c | 0.055 | 0.030 | exit 0 | not sampled | replay batch 16 at 3b637355, 40 workers, 106 of 106 games |
| 2026-11-16 07:26 PST | gate-3b637355-b20 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.050 | exit 0 | load 48.1 of 60 mean, peak 9.4 GB | replay batch 20 at 3b637355, 40 workers, 605 of 605 games |
| 2026-11-16 07:32 PST | gate-3b637355-pilots | c3d-highcpu-60 | us-east1-c | 0.090 | 0.049 | exit 0 | load 62.2 of 60 mean, peak 10.1 GB | replay batch pilots at 3b637355, 40 workers, 1353 of 1353 games |
| 2026-11-16 07:23 PST | gate-3b637355-b9 | c3d-highcpu-60 | us-central1-a | 0.272 | 0.147 | exit 0 | load 66.5 of 60 mean, peak 13.5 GB | replay batch 9 at 3b637355, 40 workers, 3000 of 3000 games |
| 2026-11-16 07:21 PST | gate-3b637355-b10 | c3d-highcpu-60 | us-west1-c | 0.411 | 0.222 | exit 0 | load 63.7 of 60 mean, peak 15.0 GB | replay batch 10 at 3b637355, 40 workers, 3000 of 3000 games |
| 2026-11-16 07:40 PST | gate-3b637355-b13 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.068 | exit 0 | load 69.4 of 60 mean, peak 10.6 GB | replay batch 13 at 3b637355, 40 workers, 1500 of 1500 games |
| 2026-11-16 07:47 PST | gate-3b637355-b17 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 47.8 of 60 mean, peak 9.8 GB | replay batch 17 at 3b637355, 40 workers, 605 of 605 games |
| 2026-11-16 07:46 PST | gate-3b637355-b14 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.067 | exit 0 | load 70.0 of 60 mean, peak 10.5 GB | replay batch 14 at 3b637355, 40 workers, 1500 of 1500 games |
| 2026-11-16 07:54 PST | gate-3b637355-b18 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.048 | exit 0 | load 48.6 of 60 mean, peak 9.2 GB | replay batch 18 at 3b637355, 40 workers, 605 of 605 games |
| 2026-11-16 08:06 PST | gate-3f860b6a-b2 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.051 | script exited early | not sampled | replay batch 2 at 3f860b6a, 40 workers, 0 of 5000 games |
| 2026-11-16 08:06 PST | gate-3f860b6a-b3 | c3d-highcpu-60 | us-east1-c | 0.093 | 0.050 | exit 0 | load 49.2 of 60 mean, peak 7.6 GB | replay batch 3 at 3f860b6a, 40 workers, 5000 of 5000 games |
| 2026-11-16 08:07 PST | gate-3f860b6a-b1 | c3d-highcpu-60 | us-west1-a | 0.093 | 0.050 | exit 0 | load 57.2 of 60 mean, peak 7.4 GB | replay batch 1 at 3f860b6a, 40 workers, 5000 of 5000 games |
| 2026-11-16 08:06 PST | gate-3f860b6a-b4 | c3d-highcpu-60 | us-central1-a | 0.165 | 0.089 | exit 0 | load 69.9 of 60 mean, peak 8.7 GB | replay batch 4 at 3f860b6a, 40 workers, 5000 of 5000 games |
| 2026-11-16 08:13 PST | gate-3f860b6a-b7 | c3d-highcpu-60 | us-east1-c | 0.238 | 0.129 | exit 0 | load 68.2 of 60 mean, peak 11.9 GB | replay batch 7 at 3f860b6a, 40 workers, 3000 of 3000 games |
| 2026-11-16 08:12 PST | gate-3f860b6a-b6 | c3d-highcpu-60 | us-central1-b | 0.346 | 0.187 | exit 0 | load 67.0 of 60 mean, peak 14.3 GB | replay batch 6 at 3f860b6a, 40 workers, 3000 of 3000 games |
| 2026-11-16 08:16 PST | gate-3f860b6a-b8 | c3d-highcpu-60 | us-central1-b | 0.310 | 0.168 | exit 0 | load 69.0 of 60 mean, peak 13.3 GB | replay batch 8 at 3f860b6a, 40 workers, 3000 of 3000 games |
| 2026-11-16 08:29 PST | gate-3f860b6a-b11 | c3d-highcpu-60 | us-east1-c | 0.130 | 0.070 | exit 0 | load 68.7 of 60 mean, peak 9.9 GB | replay batch 11 at 3f860b6a, 40 workers, 1500 of 1500 games |
| 2026-11-16 08:14 PST | gate-3f860b6a-b5 | c3d-highcpu-60 | us-west1-a | 0.384 | 0.208 | exit 0 | load 65.4 of 60 mean, peak 14.5 GB | replay batch 5 at 3f860b6a, 40 workers, 3000 of 3000 games |
| 2026-11-16 08:35 PST | gate-3f860b6a-b12 | c3d-highcpu-60 | us-central1-b | 0.129 | 0.070 | exit 0 | load 65.5 of 60 mean, peak 9.6 GB | replay batch 12 at 3f860b6a, 40 workers, 1500 of 1500 games |
| 2026-11-16 08:38 PST | gate-3f860b6a-b15 | c3d-highcpu-60 | us-east1-c | 0.093 | 0.050 | exit 0 | load 49.6 of 60 mean, peak 10.4 GB | replay batch 15 at 3f860b6a, 40 workers, 618 of 618 games |
| 2026-11-16 08:43 PST | gate-3f860b6a-b16 | c3d-highcpu-60 | us-central1-b | 0.057 | 0.031 | exit 0 | not sampled | replay batch 16 at 3f860b6a, 40 workers, 106 of 106 games |
| 2026-11-16 08:44 PST | gate-3f860b6a-b20 | c3d-highcpu-60 | us-east1-c | 0.092 | 0.050 | exit 0 | load 46.0 of 60 mean, peak 10.1 GB | replay batch 20 at 3f860b6a, 40 workers, 605 of 605 games |
| 2026-11-16 08:38 PST | gate-3f860b6a-b9 | c3d-highcpu-60 | us-west1-a | 0.270 | 0.146 | exit 0 | load 66.5 of 60 mean, peak 13.2 GB | replay batch 9 at 3f860b6a, 40 workers, 3000 of 3000 games |
| 2026-11-16 08:47 PST | gate-3f860b6a-pilots | c3d-highcpu-60 | us-central1-b | 0.126 | 0.068 | exit 0 | load 63.6 of 60 mean, peak 10.8 GB | replay batch pilots at 3f860b6a, 40 workers, 1353 of 1353 games |
| 2026-11-16 08:33 PST | gate-3f860b6a-b10 | c3d-highcpu-60 | us-central1-b | 0.379 | 0.205 | exit 0 | load 64.2 of 60 mean, peak 15.2 GB | replay batch 10 at 3f860b6a, 40 workers, 3000 of 3000 games |
| 2026-11-16 08:55 PST | gate-3f860b6a-b13 | c3d-highcpu-60 | us-central1-f | 0.124 | 0.067 | exit 0 | load 69.7 of 60 mean, peak 11.8 GB | replay batch 13 at 3f860b6a, 40 workers, 1500 of 1500 games |
| 2026-11-16 08:56 PST | gate-3f860b6a-b14 | c3d-highcpu-60 | us-central1-b | 0.124 | 0.067 | exit 0 | load 68.4 of 60 mean, peak 10.8 GB | replay batch 14 at 3f860b6a, 40 workers, 1500 of 1500 games |
| 2026-11-16 09:03 PST | gate-3f860b6a-b17 | c3d-highcpu-60 | us-central1-b | 0.094 | 0.051 | exit 0 | load 47.3 of 60 mean, peak 10.3 GB | replay batch 17 at 3f860b6a, 40 workers, 605 of 605 games |
| 2026-11-16 09:04 PST | gate-3f860b6a-b18 | c3d-highcpu-60 | us-central1-b | 0.093 | 0.050 | exit 0 | load 48.0 of 60 mean, peak 9.3 GB | replay batch 18 at 3f860b6a, 40 workers, 605 of 605 games |
| 2026-11-16 09:11 PST | gate-3f860b6a-b2r | c3d-highcpu-60 | us-central1-b | 0.093 | 0.050 | exit 0 | load 56.9 of 60 mean, peak 7.7 GB | replay batch 2 at 3f860b6a, 40 workers, 5000 of 5000 games |
| 2026-11-16 11:19 PST | gate-8affcab7-b1 | c3d-highcpu-60 | us-central1-b | 0.095 | 0.051 | exit 0 | load 52.2 of 60 mean, peak 7.8 GB | replay batch 1 at 8affcab7, 40 workers, 5000 of 5000 games |
| 2026-11-16 11:20 PST | gate-8affcab7-b3 | c3d-highcpu-60 | us-east1-c | 0.094 | 0.051 | exit 0 | load 51.9 of 60 mean, peak 7.8 GB | replay batch 3 at 8affcab7, 40 workers, 5000 of 5000 games |
| 2026-11-16 11:19 PST | gate-8affcab7-b4 | c3d-highcpu-60 | us-central1-b | 0.166 | 0.090 | exit 0 | load 68.7 of 60 mean, peak 8.6 GB | replay batch 4 at 8affcab7, 40 workers, 5000 of 5000 games |
| 2026-11-16 11:27 PST | gate-8affcab7-b2 | c3d-highcpu-60 | us-west1-a | 0.090 | 0.049 | exit 0 | load 49.7 of 60 mean, peak 7.2 GB | replay batch 2 at 8affcab7, 40 workers, 5000 of 5000 games |
| 2026-11-16 11:27 PST | gate-8affcab7-b7 | c3d-highcpu-60 | us-east1-c | 0.231 | 0.125 | exit 0 | load 68.6 of 60 mean, peak 11.8 GB | replay batch 7 at 8affcab7, 40 workers, 3000 of 3000 games |
| 2026-11-16 11:25 PST | gate-8affcab7-b5 | c3d-highcpu-60 | us-central1-b | 0.338 | 0.183 | exit 0 | load 66.8 of 60 mean, peak 13.9 GB | replay batch 5 at 8affcab7, 40 workers, 3000 of 3000 games |
| 2026-11-16 11:30 PST | gate-8affcab7-b8 | c3d-highcpu-60 | us-central1-b | 0.265 | 0.143 | exit 0 | load 68.3 of 60 mean, peak 12.6 GB | replay batch 8 at 8affcab7, 40 workers, 3000 of 3000 games |
| 2026-11-16 11:41 PST | gate-8affcab7-b11 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.048 | exit 0 | load 61.0 of 60 mean, peak 10.1 GB | replay batch 11 at 8affcab7, 40 workers, 1500 of 1500 games |
| 2026-11-16 11:48 PST | gate-8affcab7-b15 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.048 | exit 0 | load 47.1 of 60 mean, peak 9.7 GB | replay batch 15 at 8affcab7, 40 workers, 618 of 618 games |
| 2026-11-16 11:46 PST | gate-8affcab7-b12 | c3d-highcpu-60 | us-central1-b | 0.124 | 0.067 | exit 0 | load 62.3 of 60 mean, peak 10.1 GB | replay batch 12 at 8affcab7, 40 workers, 1500 of 1500 games |
| 2026-11-16 11:53 PST | gate-8affcab7-b20 | c3d-highcpu-60 | us-central1-b | 0.054 | 0.029 | exit 0 | load 47.4 of 60 mean, peak 9.7 GB | replay batch 20 at 8affcab7, 40 workers, 605 of 605 games |
| 2026-11-16 11:46 PST | gate-8affcab7-b9 | c3d-highcpu-60 | us-central1-b | 0.268 | 0.145 | exit 0 | load 68.0 of 60 mean, peak 12.9 GB | replay batch 9 at 8affcab7, 40 workers, 3000 of 3000 games |
| 2026-11-16 12:01 PST | gate-8affcab7-b16 | c3d-highcpu-60 | us-central1-b | 0.054 | 0.029 | exit 0 | not sampled | replay batch 16 at 8affcab7, 40 workers, 106 of 106 games |
| 2026-11-16 11:47 PST | gate-8affcab7-b6 | c3d-highcpu-60 | us-east1-c | 0.334 | 0.181 | exit 0 | load 67.6 of 60 mean, peak 14.5 GB | replay batch 6 at 8affcab7, 40 workers, 3000 of 3000 games |
| 2026-11-16 12:02 PST | gate-8affcab7-b13 | c3d-highcpu-60 | us-central1-b | 0.127 | 0.069 | exit 0 | load 70.2 of 60 mean, peak 10.2 GB | replay batch 13 at 8affcab7, 40 workers, 1500 of 1500 games |
| 2026-11-16 12:04 PST | gate-8affcab7-pilots | c3d-highcpu-60 | us-central1-b | 0.124 | 0.067 | exit 0 | load 64.8 of 60 mean, peak 11.3 GB | replay batch pilots at 8affcab7, 40 workers, 1353 of 1353 games |
| 2026-11-16 12:10 PST | gate-8affcab7-b17 | c3d-highcpu-60 | us-central1-b | 0.088 | 0.048 | exit 0 | load 46.9 of 60 mean, peak 10.0 GB | replay batch 17 at 8affcab7, 40 workers, 605 of 605 games |
| 2026-11-16 12:08 PST | gate-8affcab7-b10 | c3d-highcpu-60 | us-east1-c | 0.371 | 0.201 | exit 0 | load 63.2 of 60 mean, peak 16.7 GB | replay batch 10 at 8affcab7, 40 workers, 3000 of 3000 games |
| 2026-11-16 12:31 PST | gate-8affcab7-b14 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.048 | exit 0 | load 61.8 of 60 mean, peak 10.0 GB | replay batch 14 at 8affcab7, 40 workers, 1500 of 1500 games |
| 2026-11-16 12:36 PST | gate-8affcab7-b18 | c3d-highcpu-60 | us-central1-b | 0.053 | 0.029 | exit 0 | load 47.8 of 60 mean, peak 9.8 GB | replay batch 18 at 8affcab7, 40 workers, 605 of 605 games |
| 2026-11-17 02:00 PST | gate-3128721b-b1 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.045 | exit 0 | load 52.0 of 60 mean, peak 7.8 GB | replay batch 1 at 3128721b, 40 workers, 5000 of 5000 games |
| 2026-11-17 02:00 PST | gate-3128721b-b2 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.045 | exit 0 | load 51.1 of 60 mean, peak 7.6 GB | replay batch 2 at 3128721b, 40 workers, 5000 of 5000 games |
| 2026-11-17 02:01 PST | gate-3128721b-b3 | c3d-highcpu-60 | us-west1-a | 0.086 | 0.044 | exit 0 | load 50.2 of 60 mean, peak 7.5 GB | replay batch 3 at 3128721b, 40 workers, 5000 of 5000 games |
| 2026-11-17 02:00 PST | gate-3128721b-b4 | c3d-highcpu-60 | us-east1-b | 0.156 | 0.080 | exit 0 | load 69.1 of 60 mean, peak 8.8 GB | replay batch 4 at 3128721b, 40 workers, 5000 of 5000 games |
| 2026-11-17 02:07 PST | gate-3128721b-b7 | c3d-highcpu-60 | us-west1-a | 0.224 | 0.115 | exit 0 | load 68.3 of 60 mean, peak 11.7 GB | replay batch 7 at 3128721b, 40 workers, 3000 of 3000 games |
| 2026-11-17 02:06 PST | gate-3128721b-b6 | c3d-highcpu-60 | us-central1-a | 0.329 | 0.169 | exit 0 | load 67.7 of 60 mean, peak 14.3 GB | replay batch 6 at 3128721b, 40 workers, 3000 of 3000 games |
| 2026-11-17 02:11 PST | gate-3128721b-b8 | c3d-highcpu-60 | us-east1-b | 0.259 | 0.133 | exit 0 | load 68.1 of 60 mean, peak 12.4 GB | replay batch 8 at 3128721b, 40 workers, 3000 of 3000 games |
| 2026-11-17 02:22 PST | gate-3128721b-b11 | c3d-highcpu-60 | us-west1-a | 0.086 | 0.044 | exit 0 | load 61.8 of 60 mean, peak 9.9 GB | replay batch 11 at 3128721b, 40 workers, 1500 of 1500 games |
| 2026-11-17 02:06 PST | gate-3128721b-b5 | c3d-highcpu-60 | us-central1-a | 0.364 | 0.187 | exit 0 | load 67.4 of 60 mean, peak 15.4 GB | replay batch 5 at 3128721b, 40 workers, 3000 of 3000 games |
| 2026-11-17 02:27 PST | gate-3128721b-b15 | c3d-highcpu-60 | us-central1-a | 0.052 | 0.027 | exit 0 | load 47.9 of 60 mean, peak 10.5 GB | replay batch 15 at 3128721b, 40 workers, 618 of 618 games |
| 2026-11-17 02:27 PST | gate-3128721b-b12 | c3d-highcpu-60 | us-east1-b | 0.087 | 0.045 | exit 0 | load 61.0 of 60 mean, peak 10.6 GB | replay batch 12 at 3128721b, 40 workers, 1500 of 1500 games |
| 2026-11-17 02:31 PST | gate-3128721b-b20 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.045 | exit 0 | load 46.3 of 60 mean, peak 9.2 GB | replay batch 20 at 3128721b, 40 workers, 605 of 605 games |
| 2026-11-17 02:33 PST | gate-3128721b-b16 | c3d-highcpu-60 | us-east1-b | 0.052 | 0.027 | exit 0 | not sampled | replay batch 16 at 3128721b, 40 workers, 106 of 106 games |
| 2026-11-17 02:37 PST | gate-3128721b-pilots | c3d-highcpu-60 | us-central1-a | 0.086 | 0.044 | exit 0 | load 61.1 of 60 mean, peak 10.4 GB | replay batch pilots at 3128721b, 40 workers, 1353 of 1353 games |
| 2026-11-17 02:28 PST | gate-3128721b-b9 | c3d-highcpu-60 | us-west1-a | 0.259 | 0.133 | exit 0 | load 66.6 of 60 mean, peak 12.9 GB | replay batch 9 at 3128721b, 40 workers, 3000 of 3000 games |
| 2026-11-17 02:26 PST | gate-3128721b-b10 | c3d-highcpu-60 | us-central1-a | 0.398 | 0.205 | exit 0 | load 63.5 of 60 mean, peak 15.2 GB | replay batch 10 at 3128721b, 40 workers, 3000 of 3000 games |
| 2026-11-17 02:44 PST | gate-3128721b-b13 | c3d-highcpu-60 | us-central1-a | 0.121 | 0.062 | exit 0 | load 67.4 of 60 mean, peak 10.4 GB | replay batch 13 at 3128721b, 40 workers, 1500 of 1500 games |
| 2026-11-17 02:52 PST | gate-3128721b-b17 | c3d-highcpu-60 | us-central1-a | 0.052 | 0.027 | exit 0 | load 52.3 of 60 mean, peak 9.9 GB | replay batch 17 at 3128721b, 40 workers, 605 of 605 games |
| 2026-11-17 02:50 PST | gate-3128721b-b14 | c3d-highcpu-60 | us-central1-a | 0.121 | 0.062 | exit 0 | load 63.9 of 60 mean, peak 10.4 GB | replay batch 14 at 3128721b, 40 workers, 1500 of 1500 games |
| 2026-11-17 02:57 PST | gate-3128721b-b18 | c3d-highcpu-60 | us-central1-a | 0.052 | 0.027 | exit 0 | load 47.7 of 60 mean, peak 10.1 GB | replay batch 18 at 3128721b, 40 workers, 605 of 605 games |
| 2026-11-19 02:00 PST | gate-4e8358db-b1 | c3d-highcpu-60 | us-central1-b | 0.093 | 0.048 | exit 0 | load 49.0 of 60 mean, peak 7.8 GB | replay batch 1 at 4e8358db, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:01 PST | gate-4e8358db-b3 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.046 | exit 0 | load 50.3 of 60 mean, peak 7.2 GB | replay batch 3 at 4e8358db, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:01 PST | gate-4e8358db-b2 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.045 | exit 0 | load 51.2 of 60 mean, peak 8.1 GB | replay batch 2 at 4e8358db, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:01 PST | gate-4e8358db-b4 | c3d-highcpu-60 | us-central1-b | 0.161 | 0.083 | exit 0 | load 68.2 of 60 mean, peak 9.0 GB | replay batch 4 at 4e8358db, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:06 PST | gate-c4341a75-b4 | c3d-highcpu-60 | us-west1-c | 0.169 | 0.087 | exit 0 | load 71.3 of 60 mean, peak 8.9 GB | replay batch 4 at c4341a75, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:07 PST | gate-4e8358db-b7 | c3d-highcpu-60 | us-east1-b | 0.231 | 0.119 | exit 0 | load 67.7 of 60 mean, peak 11.7 GB | replay batch 7 at 4e8358db, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:06 PST | gate-4e8358db-b5 | c3d-highcpu-60 | us-central1-a | 0.338 | 0.174 | exit 0 | load 68.1 of 60 mean, peak 14.5 GB | replay batch 5 at 4e8358db, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:11 PST | gate-4e8358db-b8 | c3d-highcpu-60 | us-central1-a | 0.272 | 0.140 | exit 0 | load 68.8 of 60 mean, peak 13.1 GB | replay batch 8 at 4e8358db, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:27 PST | gate-c4341a75-b1 | c3d-highcpu-60 | us-central1-c | 0.091 | 0.047 | exit 0 | load 51.0 of 60 mean, peak 7.7 GB | replay batch 1 at c4341a75, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:27 PST | gate-c4341a75-b3 | c3d-highcpu-60 | us-central1-f | 0.091 | 0.047 | exit 0 | load 51.4 of 60 mean, peak 7.4 GB | replay batch 3 at c4341a75, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:18 PST | gate-c4341a75-b8 | c3d-highcpu-60 | us-west1-a | 0.272 | 0.140 | exit 0 | load 69.8 of 60 mean, peak 12.6 GB | replay batch 8 at c4341a75, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:21 PST | gate-4e8358db-b6 | c3d-highcpu-60 | us-east1-b | 0.299 | 0.154 | exit 0 | load 67.5 of 60 mean, peak 14.3 GB | replay batch 6 at 4e8358db, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:33 PST | gate-c4341a75-b7 | c3d-highcpu-60 | us-central1-a | 0.230 | 0.118 | exit 0 | load 67.9 of 60 mean, peak 11.7 GB | replay batch 7 at c4341a75, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:35 PST | gate-4e8358db-b9 | c3d-highcpu-60 | us-west1-a | 0.260 | 0.134 | exit 0 | load 67.4 of 60 mean, peak 13.1 GB | replay batch 9 at 4e8358db, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:47 PST | gate-c4341a75-b2 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 50.9 of 60 mean, peak 8.0 GB | replay batch 2 at c4341a75, 40 workers, 5000 of 5000 games |
| 2026-11-19 02:33 PST | gate-c4341a75-b5 | c3d-highcpu-60 | us-central1-a | 0.339 | 0.174 | exit 0 | load 67.5 of 60 mean, peak 14.5 GB | replay batch 5 at c4341a75, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:52 PST | gate-4e8358db-b13 | c3d-highcpu-60 | us-west1-a | 0.123 | 0.063 | exit 0 | load 69.3 of 60 mean, peak 11.0 GB | replay batch 13 at 4e8358db, 40 workers, 1500 of 1500 games |
| 2026-11-19 02:40 PST | gate-4e8358db-b10 | c3d-highcpu-60 | us-east1-b | 0.369 | 0.190 | exit 0 | load 64.0 of 60 mean, peak 16.9 GB | replay batch 10 at 4e8358db, 40 workers, 3000 of 3000 games |
| 2026-11-19 03:02 PST | gate-c4341a75-b12 | c3d-highcpu-60 | us-east1-c | 0.092 | 0.047 | exit 0 | load 61.2 of 60 mean, peak 10.3 GB | replay batch 12 at c4341a75, 40 workers, 1500 of 1500 games |
| 2026-11-19 03:03 PST | gate-4e8358db-b11 | c3d-highcpu-60 | us-west1-a | 0.090 | 0.046 | exit 0 | load 62.1 of 60 mean, peak 9.9 GB | replay batch 11 at 4e8358db, 40 workers, 1500 of 1500 games |
| 2026-11-19 02:53 PST | gate-c4341a75-b9 | c3d-highcpu-60 | us-central1-a | 0.270 | 0.139 | exit 0 | load 69.5 of 60 mean, peak 12.9 GB | replay batch 9 at c4341a75, 40 workers, 3000 of 3000 games |
| 2026-11-19 02:53 PST | gate-c4341a75-b6 | c3d-highcpu-60 | us-central1-a | 0.305 | 0.157 | exit 0 | load 68.0 of 60 mean, peak 14.5 GB | replay batch 6 at c4341a75, 40 workers, 3000 of 3000 games |
| 2026-11-19 03:10 PST | gate-4e8358db-b15 | c3d-highcpu-60 | us-central1-c | 0.053 | 0.027 | exit 0 | load 46.8 of 60 mean, peak 9.8 GB | replay batch 15 at 4e8358db, 40 workers, 618 of 618 games |
| 2026-11-19 03:08 PST | gate-c4341a75-b11 | c3d-highcpu-60 | us-east1-b | 0.090 | 0.046 | exit 0 | load 57.7 of 60 mean, peak 9.8 GB | replay batch 11 at c4341a75, 40 workers, 1500 of 1500 games |
| 2026-11-19 03:09 PST | gate-4e8358db-b12 | c3d-highcpu-60 | us-west1-a | 0.087 | 0.045 | exit 0 | load 60.0 of 60 mean, peak 10.6 GB | replay batch 12 at 4e8358db, 40 workers, 1500 of 1500 games |
| 2026-11-19 03:13 PST | gate-4e8358db-b20 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.027 | exit 0 | load 45.7 of 60 mean, peak 10.1 GB | replay batch 20 at 4e8358db, 40 workers, 605 of 605 games |
| 2026-11-19 03:15 PST | gate-c4341a75-b15 | c3d-highcpu-60 | us-east1-b | 0.054 | 0.028 | exit 0 | load 48.2 of 60 mean, peak 10.1 GB | replay batch 15 at c4341a75, 40 workers, 618 of 618 games |
| 2026-11-19 03:16 PST | gate-4e8358db-b16 | c3d-highcpu-60 | us-west1-a | 0.052 | 0.027 | exit 0 | not sampled | replay batch 16 at 4e8358db, 40 workers, 106 of 106 games |
| 2026-11-19 03:16 PST | gate-c4341a75-b16 | c3d-highcpu-60 | us-west1-c | 0.054 | 0.028 | exit 0 | not sampled | replay batch 16 at c4341a75, 40 workers, 106 of 106 games |
| 2026-11-19 03:18 PST | gate-c4341a75-b20 | c3d-highcpu-60 | us-central1-b | 0.054 | 0.028 | exit 0 | load 47.9 of 60 mean, peak 10.6 GB | replay batch 20 at c4341a75, 40 workers, 605 of 605 games |
| 2026-11-19 03:22 PST | gate-4e8358db-b17 | c3d-highcpu-60 | us-west1-a | 0.053 | 0.027 | exit 0 | load 47.5 of 60 mean, peak 10.8 GB | replay batch 17 at 4e8358db, 40 workers, 605 of 605 games |
| 2026-11-19 03:20 PST | gate-4e8358db-pilots | c3d-highcpu-60 | us-east1-b | 0.088 | 0.045 | exit 0 | load 53.3 of 60 mean, peak 9.3 GB | replay batch pilots at 4e8358db, 40 workers, 1353 of 1353 games |
| 2026-11-19 03:21 PST | gate-c4341a75-pilots | c3d-highcpu-60 | us-west1-a | 0.089 | 0.046 | exit 0 | load 60.3 of 60 mean, peak 9.9 GB | replay batch pilots at c4341a75, 40 workers, 1353 of 1353 games |
| 2026-11-19 03:12 PST | gate-c4341a75-b10 | c3d-highcpu-60 | us-central1-a | 0.374 | 0.192 | exit 0 | load 65.5 of 60 mean, peak 15.8 GB | replay batch 10 at c4341a75, 40 workers, 3000 of 3000 games |
| 2026-11-19 03:30 PST | gate-4e8358db-b14 | c3d-highcpu-60 | us-central1-a | 0.122 | 0.063 | exit 0 | load 64.8 of 60 mean, peak 10.8 GB | replay batch 14 at 4e8358db, 40 workers, 1500 of 1500 games |
| 2026-11-19 03:31 PST | gate-c4341a75-b13 | c3d-highcpu-60 | us-east1-b | 0.125 | 0.064 | exit 0 | load 67.1 of 60 mean, peak 10.7 GB | replay batch 13 at c4341a75, 40 workers, 1500 of 1500 games |
| 2026-11-19 03:35 PST | gate-c4341a75-b14 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 59.2 of 60 mean, peak 10.6 GB | replay batch 14 at c4341a75, 40 workers, 1500 of 1500 games |
| 2026-11-19 03:38 PST | gate-4e8358db-b18 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.027 | exit 0 | load 49.1 of 60 mean, peak 9.5 GB | replay batch 18 at 4e8358db, 40 workers, 605 of 605 games |
| 2026-11-19 03:39 PST | gate-c4341a75-b17 | c3d-highcpu-60 | us-east1-b | 0.056 | 0.029 | exit 0 | load 49.3 of 60 mean, peak 9.7 GB | replay batch 17 at c4341a75, 40 workers, 605 of 605 games |
| 2026-11-19 03:41 PST | gate-c4341a75-b18 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.027 | exit 0 | load 49.2 of 60 mean, peak 9.7 GB | replay batch 18 at c4341a75, 40 workers, 605 of 605 games |
| 2026-11-19 03:59 PST | gate-8dc05366-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 51.7 of 60 mean, peak 7.0 GB | replay batch 2 at 8dc05366, 40 workers, 5000 of 5000 games |
| 2026-11-19 03:59 PST | gate-8dc05366-b1 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.046 | exit 0 | load 52.2 of 60 mean, peak 7.5 GB | replay batch 1 at 8dc05366, 40 workers, 5000 of 5000 games |
| 2026-11-19 03:58 PST | gate-8dc05366-b3 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.064 | exit 0 | load 55.9 of 60 mean, peak 7.4 GB | replay batch 3 at 8dc05366, 40 workers, 5000 of 5000 games |
| 2026-11-19 03:59 PST | gate-8dc05366-b4 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.064 | exit 0 | load 66.2 of 60 mean, peak 9.0 GB | replay batch 4 at 8dc05366, 40 workers, 5000 of 5000 games |
| 2026-11-19 04:06 PST | gate-8dc05366-b7 | c3d-highcpu-60 | us-central1-a | 0.270 | 0.139 | exit 0 | load 69.7 of 60 mean, peak 11.4 GB | replay batch 7 at 8dc05366, 40 workers, 3000 of 3000 games |
| 2026-11-19 04:08 PST | gate-8dc05366-b8 | c3d-highcpu-60 | us-west1-a | 0.267 | 0.137 | exit 0 | load 68.7 of 60 mean, peak 12.6 GB | replay batch 8 at 8dc05366, 40 workers, 3000 of 3000 games |
| 2026-11-19 04:04 PST | gate-8dc05366-b6 | c3d-highcpu-60 | us-central1-a | 0.337 | 0.173 | exit 0 | load 67.5 of 60 mean, peak 13.9 GB | replay batch 6 at 8dc05366, 40 workers, 3000 of 3000 games |
| 2026-11-19 04:05 PST | gate-8dc05366-b5 | c3d-highcpu-60 | us-east1-b | 0.342 | 0.176 | exit 0 | load 68.2 of 60 mean, peak 14.7 GB | replay batch 5 at 8dc05366, 40 workers, 3000 of 3000 games |
| 2026-11-19 04:25 PST | gate-8dc05366-b12 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.048 | exit 0 | load 63.9 of 60 mean, peak 10.3 GB | replay batch 12 at 8dc05366, 40 workers, 1500 of 1500 games |
| 2026-11-19 04:23 PST | gate-8dc05366-b11 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 64.2 of 60 mean, peak 10.1 GB | replay batch 11 at 8dc05366, 40 workers, 1500 of 1500 games |
| 2026-11-19 04:31 PST | gate-8dc05366-b16 | c3d-highcpu-60 | us-central1-a | 0.057 | 0.029 | exit 0 | not sampled | replay batch 16 at 8dc05366, 40 workers, 106 of 106 games |
| 2026-11-19 04:32 PST | gate-8dc05366-b15 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 52.5 of 60 mean, peak 10.1 GB | replay batch 15 at 8dc05366, 40 workers, 618 of 618 games |
| 2026-11-19 04:38 PST | gate-8dc05366-b20 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | load 47.3 of 60 mean, peak 10.1 GB | replay batch 20 at 8dc05366, 40 workers, 605 of 605 games |
| 2026-11-19 04:35 PST | gate-8dc05366-pilots | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 65.6 of 60 mean, peak 10.3 GB | replay batch pilots at 8dc05366, 40 workers, 1353 of 1353 games |
| 2026-11-19 04:27 PST | gate-8dc05366-b9 | c3d-highcpu-60 | us-east1-b | 0.271 | 0.139 | exit 0 | load 67.8 of 60 mean, peak 12.9 GB | replay batch 9 at 8dc05366, 40 workers, 3000 of 3000 games |
| 2026-11-19 04:26 PST | gate-8dc05366-b10 | c3d-highcpu-60 | us-west1-a | 0.376 | 0.193 | exit 0 | load 64.2 of 60 mean, peak 15.4 GB | replay batch 10 at 8dc05366, 40 workers, 3000 of 3000 games |
| 2026-11-19 04:44 PST | gate-8dc05366-b13 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.064 | exit 0 | load 66.3 of 60 mean, peak 10.6 GB | replay batch 13 at 8dc05366, 40 workers, 1500 of 1500 games |
| 2026-11-19 04:52 PST | gate-8dc05366-b17 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | load 50.8 of 60 mean, peak 10.1 GB | replay batch 17 at 8dc05366, 40 workers, 605 of 605 games |
| 2026-11-19 04:49 PST | gate-8dc05366-b14 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.064 | exit 0 | load 65.9 of 60 mean, peak 10.5 GB | replay batch 14 at 8dc05366, 40 workers, 1500 of 1500 games |
| 2026-11-19 04:57 PST | gate-8dc05366-b18 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | load 45.6 of 60 mean, peak 9.7 GB | replay batch 18 at 8dc05366, 40 workers, 605 of 605 games |
| 2026-11-19 05:42 PST | gate-cc6961cc-b1 | c3d-highcpu-60 | us-central1-a | 0.105 | 0.054 | exit 0 | load 51.4 of 60 mean, peak 7.4 GB | replay batch 1 at cc6961cc, 40 workers, 5000 of 5000 games |
| 2026-11-19 05:43 PST | gate-cc6961cc-b3 | c3d-highcpu-60 | us-east1-b | 0.109 | 0.056 | exit 0 | load 50.4 of 60 mean, peak 7.8 GB | replay batch 3 at cc6961cc, 40 workers, 5000 of 5000 games |
| 2026-11-19 05:44 PST | gate-cc6961cc-b2 | c3d-highcpu-60 | us-west1-a | 0.110 | 0.057 | exit 0 | load 46.8 of 60 mean, peak 7.4 GB | replay batch 2 at cc6961cc, 40 workers, 5000 of 5000 games |
| 2026-11-19 05:42 PST | gate-cc6961cc-b4 | c3d-highcpu-60 | us-central1-a | 0.147 | 0.076 | exit 0 | load 67.2 of 60 mean, peak 8.5 GB | replay batch 4 at cc6961cc, 40 workers, 5000 of 5000 games |
| 2026-11-19 05:51 PST | gate-cc6961cc-b7 | c3d-highcpu-60 | us-east1-b | 0.238 | 0.122 | exit 0 | load 69.1 of 60 mean, peak 11.5 GB | replay batch 7 at cc6961cc, 40 workers, 3000 of 3000 games |
| 2026-11-19 05:53 PST | gate-cc6961cc-b8 | c3d-highcpu-60 | us-west1-a | 0.272 | 0.140 | exit 0 | load 68.3 of 60 mean, peak 13.2 GB | replay batch 8 at cc6961cc, 40 workers, 3000 of 3000 games |
| 2026-11-19 05:49 PST | gate-cc6961cc-b5 | c3d-highcpu-60 | us-central1-a | 0.349 | 0.179 | exit 0 | load 68.1 of 60 mean, peak 13.9 GB | replay batch 5 at cc6961cc, 40 workers, 3000 of 3000 games |
| 2026-11-19 05:51 PST | gate-cc6961cc-b6 | c3d-highcpu-60 | us-central1-a | 0.347 | 0.178 | exit 0 | load 67.2 of 60 mean, peak 14.6 GB | replay batch 6 at cc6961cc, 40 workers, 3000 of 3000 games |
| 2026-11-19 06:07 PST | gate-cc6961cc-b11 | c3d-highcpu-60 | us-east1-b | 0.093 | 0.048 | exit 0 | load 58.0 of 60 mean, peak 10.2 GB | replay batch 11 at cc6961cc, 40 workers, 1500 of 1500 games |
| 2026-11-19 06:11 PST | gate-cc6961cc-b12 | c3d-highcpu-60 | us-west1-a | 0.092 | 0.047 | exit 0 | load 60.4 of 60 mean, peak 10.2 GB | replay batch 12 at cc6961cc, 40 workers, 1500 of 1500 games |
| 2026-11-19 06:14 PST | gate-cc6961cc-b15 | c3d-highcpu-60 | us-east1-b | 0.056 | 0.029 | exit 0 | load 46.5 of 60 mean, peak 10.2 GB | replay batch 15 at cc6961cc, 40 workers, 618 of 618 games |
| 2026-11-19 06:18 PST | gate-cc6961cc-b16 | c3d-highcpu-60 | us-east1-b | 0.056 | 0.029 | exit 0 | not sampled | replay batch 16 at cc6961cc, 40 workers, 106 of 106 games |
| 2026-11-19 06:19 PST | gate-cc6961cc-b20 | c3d-highcpu-60 | us-west1-a | 0.056 | 0.029 | exit 0 | load 46.4 of 60 mean, peak 10.6 GB | replay batch 20 at cc6961cc, 40 workers, 605 of 605 games |
| 2026-11-19 06:11 PST | gate-cc6961cc-b9 | c3d-highcpu-60 | us-central1-c | 0.273 | 0.140 | exit 0 | load 69.6 of 60 mean, peak 12.7 GB | replay batch 9 at cc6961cc, 40 workers, 3000 of 3000 games |
| 2026-11-19 06:22 PST | gate-cc6961cc-pilots | c3d-highcpu-60 | us-east1-b | 0.129 | 0.066 | exit 0 | load 64.5 of 60 mean, peak 10.5 GB | replay batch pilots at cc6961cc, 40 workers, 1353 of 1353 games |
| 2026-11-19 06:13 PST | gate-cc6961cc-b10 | c3d-highcpu-60 | us-central1-c | 0.345 | 0.177 | exit 0 | load 63.9 of 60 mean, peak 15.3 GB | replay batch 10 at cc6961cc, 40 workers, 3000 of 3000 games |
| 2026-11-19 06:28 PST | gate-cc6961cc-b13 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 67.0 of 60 mean, peak 10.8 GB | replay batch 13 at cc6961cc, 40 workers, 1500 of 1500 games |
| 2026-11-19 06:34 PST | gate-cc6961cc-b14 | c3d-highcpu-60 | us-central1-b | 0.092 | 0.047 | exit 0 | load 62.6 of 60 mean, peak 10.7 GB | replay batch 14 at cc6961cc, 40 workers, 1500 of 1500 games |
| 2026-11-19 06:37 PST | gate-cc6961cc-b17 | c3d-highcpu-60 | us-central1-a | 0.056 | 0.029 | exit 0 | load 49.1 of 60 mean, peak 9.9 GB | replay batch 17 at cc6961cc, 40 workers, 605 of 605 games |
| 2026-11-19 06:40 PST | gate-cc6961cc-b18 | c3d-highcpu-60 | us-central1-a | 0.062 | 0.032 | exit 0 | load 46.8 of 60 mean, peak 9.1 GB | replay batch 18 at cc6961cc, 40 workers, 605 of 605 games |
| 2026-11-19 07:26 PST | gate-4e9d8ffb-b3 | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 51.8 of 60 mean, peak 7.6 GB | replay batch 3 at 4e9d8ffb, 40 workers, 5000 of 5000 games |
| 2026-11-19 07:27 PST | gate-4e9d8ffb-b2 | c3d-highcpu-60 | us-east1-c | 0.097 | 0.050 | exit 0 | load 48.2 of 60 mean, peak 7.7 GB | replay batch 2 at 4e9d8ffb, 40 workers, 5000 of 5000 games |
| 2026-11-19 07:28 PST | gate-4e9d8ffb-b1 | c3d-highcpu-60 | us-west1-c | 0.096 | 0.049 | exit 0 | load 49.3 of 60 mean, peak 7.3 GB | replay batch 1 at 4e9d8ffb, 40 workers, 5000 of 5000 games |
| 2026-11-19 07:26 PST | gate-4e9d8ffb-b4 | c3d-highcpu-60 | us-central1-a | 0.134 | 0.069 | exit 0 | load 67.2 of 60 mean, peak 9.2 GB | replay batch 4 at 4e9d8ffb, 40 workers, 5000 of 5000 games |
| 2026-11-19 07:33 PST | gate-4e9d8ffb-b7 | c3d-highcpu-60 | us-central1-a | 0.220 | 0.113 | exit 0 | load 68.9 of 60 mean, peak 11.9 GB | replay batch 7 at 4e9d8ffb, 40 workers, 3000 of 3000 games |
| 2026-11-19 07:47 PST | gate-4e9d8ffb-b11 | c3d-highcpu-60 | us-central1-a | 0.103 | 0.053 | exit 0 | load 58.8 of 60 mean, peak 9.9 GB | replay batch 11 at 4e9d8ffb, 40 workers, 1500 of 1500 games |
| 2026-11-19 07:37 PST | gate-4e9d8ffb-b8 | c3d-highcpu-60 | us-west1-c | 0.296 | 0.152 | exit 0 | load 69.4 of 60 mean, peak 13.7 GB | replay batch 8 at 4e9d8ffb, 40 workers, 3000 of 3000 games |
| 2026-11-19 07:35 PST | gate-4e9d8ffb-b6 | c3d-highcpu-60 | us-east1-c | 0.333 | 0.171 | exit 0 | load 67.3 of 60 mean, peak 12.8 GB | replay batch 6 at 4e9d8ffb, 40 workers, 3000 of 3000 games |
| 2026-11-19 07:34 PST | gate-4e9d8ffb-b5 | c3d-highcpu-60 | us-central1-a | 0.371 | 0.191 | exit 0 | load 67.7 of 60 mean, peak 14.0 GB | replay batch 5 at 4e9d8ffb, 40 workers, 3000 of 3000 games |
| 2026-11-19 07:55 PST | gate-4e9d8ffb-b15 | c3d-highcpu-60 | us-central1-a | 0.061 | 0.031 | exit 0 | load 47.1 of 60 mean, peak 10.0 GB | replay batch 15 at 4e9d8ffb, 40 workers, 618 of 618 games |
| 2026-11-19 07:56 PST | gate-4e9d8ffb-b12 | c3d-highcpu-60 | us-east1-c | 0.094 | 0.048 | exit 0 | load 59.6 of 60 mean, peak 10.0 GB | replay batch 12 at 4e9d8ffb, 40 workers, 1500 of 1500 games |
| 2026-11-19 07:59 PST | gate-4e9d8ffb-b20 | c3d-highcpu-60 | us-central1-c | 0.095 | 0.049 | exit 0 | load 45.9 of 60 mean, peak 9.8 GB | replay batch 20 at 4e9d8ffb, 40 workers, 605 of 605 games |
| 2026-11-19 08:03 PST | gate-4e9d8ffb-b16 | c3d-highcpu-60 | us-east1-c | 0.057 | 0.029 | exit 0 | not sampled | replay batch 16 at 4e9d8ffb, 40 workers, 106 of 106 games |
| 2026-11-19 08:07 PST | gate-4e9d8ffb-pilots | c3d-highcpu-60 | us-central1-b | 0.092 | 0.047 | exit 0 | load 60.4 of 60 mean, peak 10.9 GB | replay batch pilots at 4e9d8ffb, 40 workers, 1353 of 1353 games |
| 2026-11-19 07:58 PST | gate-4e9d8ffb-b9 | c3d-highcpu-60 | us-central1-c | 0.311 | 0.160 | exit 0 | load 68.1 of 60 mean, peak 13.9 GB | replay batch 9 at 4e9d8ffb, 40 workers, 3000 of 3000 games |
| 2026-11-19 07:57 PST | gate-4e9d8ffb-b10 | c3d-highcpu-60 | us-west1-c | 0.383 | 0.197 | exit 0 | load 64.3 of 60 mean, peak 15.8 GB | replay batch 10 at 4e9d8ffb, 40 workers, 3000 of 3000 games |
| 2026-11-19 08:17 PST | gate-4e9d8ffb-b13 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.066 | exit 0 | load 68.5 of 60 mean, peak 10.5 GB | replay batch 13 at 4e9d8ffb, 40 workers, 1500 of 1500 games |
| 2026-11-19 08:21 PST | gate-4e9d8ffb-b14 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.049 | exit 0 | load 61.4 of 60 mean, peak 10.6 GB | replay batch 14 at 4e9d8ffb, 40 workers, 1500 of 1500 games |
| 2026-11-19 08:25 PST | gate-4e9d8ffb-b17 | c3d-highcpu-60 | us-central1-a | 0.056 | 0.029 | exit 0 | load 49.1 of 60 mean, peak 9.4 GB | replay batch 17 at 4e9d8ffb, 40 workers, 605 of 605 games |
| 2026-11-19 08:27 PST | gate-4e9d8ffb-b18 | c3d-highcpu-60 | us-central1-a | 0.056 | 0.029 | exit 0 | load 49.9 of 60 mean, peak 9.8 GB | replay batch 18 at 4e9d8ffb, 40 workers, 605 of 605 games |
| 2026-11-19 09:56 PST | gate-04d77aba-b1 | c3d-highcpu-60 | us-central1-a | 0.098 | 0.050 | exit 0 | load 48.8 of 60 mean, peak 7.8 GB | replay batch 1 at 04d77aba, 40 workers, 5000 of 5000 games |
| 2026-11-19 09:57 PST | gate-04d77aba-b2 | c3d-highcpu-60 | us-east1-c | 0.097 | 0.050 | exit 0 | load 49.9 of 60 mean, peak 7.7 GB | replay batch 2 at 04d77aba, 40 workers, 5000 of 5000 games |
| 2026-11-19 09:58 PST | gate-04d77aba-b3 | c3d-highcpu-60 | us-west1-c | 0.099 | 0.051 | exit 0 | load 50.1 of 60 mean, peak 7.8 GB | replay batch 3 at 04d77aba, 40 workers, 5000 of 5000 games |
| 2026-11-19 09:56 PST | gate-04d77aba-b4 | c3d-highcpu-60 | us-central1-a | 0.132 | 0.068 | exit 0 | load 67.9 of 60 mean, peak 8.8 GB | replay batch 4 at 04d77aba, 40 workers, 5000 of 5000 games |
| 2026-11-19 10:06 PST | gate-04d77aba-b7 | c3d-highcpu-60 | us-west1-c | 0.237 | 0.122 | exit 0 | load 67.8 of 60 mean, peak 11.3 GB | replay batch 7 at 04d77aba, 40 workers, 3000 of 3000 games |
| 2026-11-19 10:06 PST | gate-04d77aba-b8 | c3d-highcpu-60 | us-west1-c | 0.271 | 0.139 | exit 0 | load 67.6 of 60 mean, peak 12.5 GB | replay batch 8 at 04d77aba, 40 workers, 3000 of 3000 games |
| 2026-11-19 10:04 PST | gate-04d77aba-b6 | c3d-highcpu-60 | us-central1-f | 0.309 | 0.159 | exit 0 | load 68.1 of 60 mean, peak 14.9 GB | replay batch 6 at 04d77aba, 40 workers, 3000 of 3000 games |
| 2026-11-19 10:03 PST | gate-04d77aba-b5 | c3d-highcpu-60 | us-central1-a | 0.382 | 0.196 | exit 0 | load 67.3 of 60 mean, peak 15.7 GB | replay batch 5 at 04d77aba, 40 workers, 3000 of 3000 games |
| 2026-11-19 10:22 PST | gate-04d77aba-b11 | c3d-highcpu-60 | us-east1-c | 0.092 | 0.047 | exit 0 | load 62.2 of 60 mean, peak 10.4 GB | replay batch 11 at 04d77aba, 40 workers, 1500 of 1500 games |
| 2026-11-19 10:23 PST | gate-04d77aba-b12 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 59.9 of 60 mean, peak 10.5 GB | replay batch 12 at 04d77aba, 40 workers, 1500 of 1500 games |
| 2026-11-19 10:29 PST | gate-04d77aba-b16 | c3d-highcpu-60 | us-central1-a | 0.055 | 0.028 | exit 0 | not sampled | replay batch 16 at 04d77aba, 40 workers, 106 of 106 games |
| 2026-11-19 10:28 PST | gate-04d77aba-b15 | c3d-highcpu-60 | us-east1-c | 0.094 | 0.048 | exit 0 | load 45.5 of 60 mean, peak 10.0 GB | replay batch 15 at 04d77aba, 40 workers, 618 of 618 games |
| 2026-11-19 10:34 PST | gate-04d77aba-pilots | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 61.0 of 60 mean, peak 10.5 GB | replay batch pilots at 04d77aba, 40 workers, 1353 of 1353 games |
| 2026-11-19 10:36 PST | gate-04d77aba-b20 | c3d-highcpu-60 | us-east1-c | 0.092 | 0.047 | exit 0 | load 45.8 of 60 mean, peak 9.8 GB | replay batch 20 at 04d77aba, 40 workers, 605 of 605 games |
| 2026-11-19 10:26 PST | gate-04d77aba-b9 | c3d-highcpu-60 | us-central1-a | 0.273 | 0.140 | exit 0 | load 69.2 of 60 mean, peak 13.7 GB | replay batch 9 at 04d77aba, 40 workers, 3000 of 3000 games |
| 2026-11-19 10:25 PST | gate-04d77aba-b10 | c3d-highcpu-60 | us-west1-c | 0.379 | 0.195 | exit 0 | load 64.6 of 60 mean, peak 15.2 GB | replay batch 10 at 04d77aba, 40 workers, 3000 of 3000 games |
| 2026-11-19 10:43 PST | gate-04d77aba-b13 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 62.5 of 60 mean, peak 11.5 GB | replay batch 13 at 04d77aba, 40 workers, 1500 of 1500 games |
| 2026-11-19 10:48 PST | gate-04d77aba-b14 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 60.9 of 60 mean, peak 10.5 GB | replay batch 14 at 04d77aba, 40 workers, 1500 of 1500 games |
| 2026-11-19 10:49 PST | gate-04d77aba-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.2 of 60 mean, peak 10.5 GB | replay batch 17 at 04d77aba, 40 workers, 605 of 605 games |
| 2026-11-19 10:54 PST | gate-04d77aba-b18 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | load 47.5 of 60 mean, peak 9.8 GB | replay batch 18 at 04d77aba, 40 workers, 605 of 605 games |
| 2026-11-19 10:58 PST | gate-e20c6358-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 52.9 of 60 mean, peak 7.3 GB | replay batch 3 at e20c6358, 40 workers, 5000 of 5000 games |
| 2026-11-19 10:58 PST | gate-e20c6358-b2 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.1 of 60 mean, peak 7.2 GB | replay batch 2 at e20c6358, 40 workers, 5000 of 5000 games |
| 2026-11-19 10:59 PST | gate-e20c6358-b1 | c3d-highcpu-60 | us-west1-c | 0.091 | 0.047 | exit 0 | load 51.6 of 60 mean, peak 7.6 GB | replay batch 1 at e20c6358, 40 workers, 5000 of 5000 games |
| 2026-11-19 10:59 PST | gate-e20c6358-b4 | c3d-highcpu-60 | us-east1-c | 0.124 | 0.064 | exit 0 | load 69.5 of 60 mean, peak 8.9 GB | replay batch 4 at e20c6358, 40 workers, 5000 of 5000 games |
| 2026-11-19 11:04 PST | gate-e20c6358-b7 | c3d-highcpu-60 | us-central1-a | 0.231 | 0.119 | exit 0 | load 68.4 of 60 mean, peak 11.8 GB | replay batch 7 at e20c6358, 40 workers, 3000 of 3000 games |
| 2026-11-19 11:07 PST | gate-e20c6358-b8 | c3d-highcpu-60 | us-east1-c | 0.266 | 0.137 | exit 0 | load 69.1 of 60 mean, peak 12.9 GB | replay batch 8 at e20c6358, 40 workers, 3000 of 3000 games |
| 2026-11-19 11:18 PST | gate-e20c6358-b11 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 60.4 of 60 mean, peak 10.0 GB | replay batch 11 at e20c6358, 40 workers, 1500 of 1500 games |
| 2026-11-19 11:04 PST | gate-e20c6358-b6 | c3d-highcpu-60 | us-central1-a | 0.336 | 0.173 | exit 0 | load 69.1 of 60 mean, peak 14.5 GB | replay batch 6 at e20c6358, 40 workers, 3000 of 3000 games |
| 2026-11-19 11:06 PST | gate-e20c6358-b5 | c3d-highcpu-60 | us-west1-c | 0.370 | 0.190 | exit 0 | load 67.9 of 60 mean, peak 14.7 GB | replay batch 5 at e20c6358, 40 workers, 3000 of 3000 games |
| 2026-11-19 11:24 PST | gate-e20c6358-b15 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.046 | exit 0 | load 49.3 of 60 mean, peak 9.7 GB | replay batch 15 at e20c6358, 40 workers, 618 of 618 games |
| 2026-11-19 11:24 PST | gate-e20c6358-b12 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 63.8 of 60 mean, peak 10.0 GB | replay batch 12 at e20c6358, 40 workers, 1500 of 1500 games |
| 2026-11-19 11:30 PST | gate-e20c6358-b20 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | load 47.0 of 60 mean, peak 10.1 GB | replay batch 20 at e20c6358, 40 workers, 605 of 605 games |
| 2026-11-19 11:31 PST | gate-e20c6358-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | not sampled | replay batch 16 at e20c6358, 40 workers, 106 of 106 games |
| 2026-11-19 11:35 PST | gate-e20c6358-pilots | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 64.1 of 60 mean, peak 10.1 GB | replay batch pilots at e20c6358, 40 workers, 1353 of 1353 games |
| 2026-11-19 11:30 PST | gate-e20c6358-b9 | c3d-highcpu-60 | us-west1-c | 0.264 | 0.136 | exit 0 | load 69.4 of 60 mean, peak 13.0 GB | replay batch 9 at e20c6358, 40 workers, 3000 of 3000 games |
| 2026-11-19 11:25 PST | gate-e20c6358-b10 | c3d-highcpu-60 | us-east1-c | 0.373 | 0.192 | exit 0 | load 64.0 of 60 mean, peak 15.8 GB | replay batch 10 at e20c6358, 40 workers, 3000 of 3000 games |
| 2026-11-19 11:48 PST | gate-e20c6358-b14 | c3d-highcpu-60 | us-central1-c | 0.090 | 0.046 | exit 0 | load 58.9 of 60 mean, peak 10.7 GB | replay batch 14 at e20c6358, 40 workers, 1500 of 1500 games |
| 2026-11-19 11:46 PST | gate-e20c6358-b13 | c3d-highcpu-60 | us-central1-b | 0.124 | 0.064 | exit 0 | load 67.6 of 60 mean, peak 10.8 GB | replay batch 13 at e20c6358, 40 workers, 1500 of 1500 games |
| 2026-11-19 11:54 PST | gate-e20c6358-b18 | c3d-highcpu-60 | us-central1-b | 0.063 | 0.032 | exit 0 | load 49.5 of 60 mean, peak 9.9 GB | replay batch 18 at e20c6358, 40 workers, 605 of 605 games |
| 2026-11-19 11:54 PST | gate-e20c6358-b17 | c3d-highcpu-60 | us-central1-b | 0.062 | 0.032 | exit 0 | load 48.9 of 60 mean, peak 10.1 GB | replay batch 17 at e20c6358, 40 workers, 605 of 605 games |
| 2026-11-19 13:03 PST | b23-p1 | c3d-highcpu-60 | us-central1-a | 0.069 | 0.035 | exit 0 | not sampled | record batch 23 at e20c6358, 40 workers, 100 of 100 games |
| 2026-11-19 13:09 PST | b23-g | c3d-highcpu-60 | us-central1-a | 0.111 | 0.057 | exit 0 | load 51.9 of 60 mean, peak 8.4 GB | record batch 23 at e20c6358, 40 workers, 600 of 600 games |
| 2026-11-19 13:16 PST | b23-f | c3d-highcpu-60 | us-central1-a | 0.063 | 0.032 | exit 0 | load 44.1 of 60 mean, peak 7.6 GB | record batch 23 at e20c6358, 40 workers, 600 of 600 games |
| 2026-11-19 13:23 PST | b23-cov | c3d-highcpu-60 | us-central1-a | 0.063 | 0.032 | exit 0 | load 26.7 of 60 mean, peak 6.4 GB | coverage batch 23 at e20c6358, 40 workers, 600 of 600 games |
| 2026-11-19 14:19 PST | gate-9eda4ca9-b3 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 50.9 of 60 mean, peak 7.5 GB | replay batch 3 at 9eda4ca9, 40 workers, 5000 of 5000 games |
| 2026-11-19 14:20 PST | gate-9eda4ca9-b2 | c3d-highcpu-60 | us-east1-c | 0.096 | 0.049 | exit 0 | load 52.3 of 60 mean, peak 7.5 GB | replay batch 2 at 9eda4ca9, 40 workers, 5000 of 5000 games |
| 2026-11-19 14:21 PST | gate-9eda4ca9-b1 | c3d-highcpu-60 | us-west1-c | 0.096 | 0.049 | exit 0 | load 48.1 of 60 mean, peak 7.3 GB | replay batch 1 at 9eda4ca9, 40 workers, 5000 of 5000 games |
| 2026-11-19 14:19 PST | gate-9eda4ca9-b4 | c3d-highcpu-60 | us-central1-a | 0.134 | 0.069 | exit 0 | load 67.5 of 60 mean, peak 9.1 GB | replay batch 4 at 9eda4ca9, 40 workers, 5000 of 5000 games |
| 2026-11-19 14:26 PST | gate-9eda4ca9-b7 | c3d-highcpu-60 | us-central1-a | 0.242 | 0.124 | exit 0 | load 68.6 of 60 mean, peak 11.5 GB | replay batch 7 at 9eda4ca9, 40 workers, 3000 of 3000 games |
| 2026-11-19 14:28 PST | gate-9eda4ca9-b6 | c3d-highcpu-60 | us-east1-c | 0.312 | 0.160 | exit 0 | load 68.9 of 60 mean, peak 14.5 GB | replay batch 6 at 9eda4ca9, 40 workers, 3000 of 3000 games |
| 2026-11-19 14:29 PST | gate-9eda4ca9-b8 | c3d-highcpu-60 | us-west1-c | 0.312 | 0.160 | exit 0 | load 68.5 of 60 mean, peak 14.0 GB | replay batch 8 at 9eda4ca9, 40 workers, 3000 of 3000 games |
| 2026-11-19 14:27 PST | gate-9eda4ca9-b5 | c3d-highcpu-60 | us-central1-c | 0.351 | 0.180 | exit 0 | load 66.4 of 60 mean, peak 14.7 GB | replay batch 5 at 9eda4ca9, 40 workers, 3000 of 3000 games |
| 2026-11-19 14:41 PST | gate-9eda4ca9-b11 | c3d-highcpu-60 | us-central1-a | 0.130 | 0.067 | exit 0 | load 65.0 of 60 mean, peak 9.4 GB | replay batch 11 at 9eda4ca9, 40 workers, 1500 of 1500 games |
| 2026-11-19 14:48 PST | gate-9eda4ca9-b12 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.049 | exit 0 | load 59.9 of 60 mean, peak 9.8 GB | replay batch 12 at 9eda4ca9, 40 workers, 1500 of 1500 games |
| 2026-11-19 14:51 PST | gate-9eda4ca9-b15 | c3d-highcpu-60 | us-west1-c | 0.097 | 0.050 | exit 0 | load 50.2 of 60 mean, peak 10.1 GB | replay batch 15 at 9eda4ca9, 40 workers, 618 of 618 games |
| 2026-11-19 14:55 PST | gate-9eda4ca9-b16 | c3d-highcpu-60 | us-central1-a | 0.056 | 0.029 | exit 0 | not sampled | replay batch 16 at 9eda4ca9, 40 workers, 106 of 106 games |
| 2026-11-19 14:59 PST | gate-9eda4ca9-b23 | c3d-highcpu-60 | us-central1-a | 0.062 | 0.032 | exit 0 | not sampled | replay batch 23 at 9eda4ca9, 40 workers, 600 of 600 games |
| 2026-11-19 14:58 PST | gate-9eda4ca9-b20 | c3d-highcpu-60 | us-west1-c | 0.107 | 0.055 | exit 0 | load 45.5 of 60 mean, peak 10.6 GB | replay batch 20 at 9eda4ca9, 40 workers, 605 of 605 games |
| 2026-11-19 14:49 PST | gate-9eda4ca9-b9 | c3d-highcpu-60 | us-central1-a | 0.293 | 0.151 | exit 0 | load 68.2 of 60 mean, peak 13.8 GB | replay batch 9 at 9eda4ca9, 40 workers, 3000 of 3000 games |
| 2026-11-19 14:48 PST | gate-9eda4ca9-b10 | c3d-highcpu-60 | us-east1-c | 0.365 | 0.188 | exit 0 | load 65.5 of 60 mean, peak 15.0 GB | replay batch 10 at 9eda4ca9, 40 workers, 3000 of 3000 games |
| 2026-11-19 15:08 PST | gate-9eda4ca9-b13 | c3d-highcpu-60 | us-central1-a | 0.106 | 0.054 | exit 0 | load 63.3 of 60 mean, peak 10.6 GB | replay batch 13 at 9eda4ca9, 40 workers, 1500 of 1500 games |
| 2026-11-19 15:11 PST | gate-9eda4ca9-b14 | c3d-highcpu-60 | us-central1-a | 0.102 | 0.052 | exit 0 | load 62.4 of 60 mean, peak 10.4 GB | replay batch 14 at 9eda4ca9, 40 workers, 1500 of 1500 games |
| 2026-11-19 15:15 PST | gate-9eda4ca9-b17 | c3d-highcpu-60 | us-central1-a | 0.062 | 0.032 | exit 0 | load 48.2 of 60 mean, peak 9.9 GB | replay batch 17 at 9eda4ca9, 40 workers, 605 of 605 games |
| 2026-11-19 15:18 PST | gate-9eda4ca9-b18 | c3d-highcpu-60 | us-central1-a | 0.067 | 0.034 | exit 0 | load 48.5 of 60 mean, peak 9.7 GB | replay batch 18 at 9eda4ca9, 40 workers, 605 of 605 games |
| 2026-11-19 15:20 PST | gate-9eda4ca9-pilots | c3d-highcpu-60 | us-central1-a | 0.108 | 0.056 | exit 0 | load 57.6 of 60 mean, peak 10.0 GB | replay batch pilots at 9eda4ca9, 40 workers, 1353 of 1353 games |
| 2026-11-19 16:58 PST | gate-309b7127-b2 | c3d-highcpu-60 | us-central1-c | 0.091 | 0.047 | exit 0 | load 51.6 of 60 mean, peak 7.4 GB | replay batch 2 at 309b7127, 40 workers, 5000 of 5000 games |
| 2026-11-19 16:58 PST | gate-309b7127-b1 | c3d-highcpu-60 | us-central1-c | 0.091 | 0.047 | exit 0 | load 53.1 of 60 mean, peak 7.2 GB | replay batch 1 at 309b7127, 40 workers, 5000 of 5000 games |
| 2026-11-19 16:58 PST | gate-309b7127-b3 | c3d-highcpu-60 | us-east1-b | 0.091 | 0.047 | exit 0 | load 51.4 of 60 mean, peak 7.6 GB | replay batch 3 at 309b7127, 40 workers, 5000 of 5000 games |
| 2026-11-19 16:59 PST | gate-309b7127-b4 | c3d-highcpu-60 | us-west1-c | 0.133 | 0.068 | exit 0 | load 68.2 of 60 mean, peak 9.1 GB | replay batch 4 at 309b7127, 40 workers, 5000 of 5000 games |
| 2026-11-19 17:04 PST | gate-309b7127-b6 | c3d-highcpu-60 | us-central1-a | 0.324 | 0.167 | exit 0 | load 68.1 of 60 mean, peak 13.3 GB | replay batch 6 at 309b7127, 40 workers, 3000 of 3000 games |
| 2026-11-19 17:09 PST | gate-309b7127-b8 | c3d-highcpu-60 | us-east1-c | 0.276 | 0.142 | exit 0 | load 70.6 of 60 mean, peak 12.6 GB | replay batch 8 at 309b7127, 40 workers, 3000 of 3000 games |
| 2026-11-19 17:04 PST | gate-309b7127-b5 | c3d-highcpu-60 | us-central1-a | 0.358 | 0.184 | exit 0 | load 66.2 of 60 mean, peak 13.8 GB | replay batch 5 at 309b7127, 40 workers, 3000 of 3000 games |
| 2026-11-19 17:27 PST | gate-309b7127-b12 | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 60.5 of 60 mean, peak 10.0 GB | replay batch 12 at 309b7127, 40 workers, 1500 of 1500 games |
| 2026-11-19 17:05 PST | gate-309b7127-b7 | c3d-highcpu-60 | us-east1-b | 0.498 | 0.256 | exit 0 | load 64.5 of 60 mean, peak 11.5 GB | replay batch 7 at 309b7127, 40 workers, 3000 of 3000 games |
| 2026-11-19 17:34 PST | gate-309b7127-b16 | c3d-highcpu-60 | us-central1-a | 0.055 | 0.028 | exit 0 | not sampled | replay batch 16 at 309b7127, 40 workers, 106 of 106 games |
| 2026-11-19 17:38 PST | gate-309b7127-b23 | c3d-highcpu-60 | us-central1-a | 0.055 | 0.028 | exit 0 | not sampled | replay batch 23 at 309b7127, 40 workers, 600 of 600 games |
| 2026-11-19 17:36 PST | gate-309b7127-b11 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.046 | exit 0 | load 57.3 of 60 mean, peak 9.9 GB | replay batch 11 at 309b7127, 40 workers, 1500 of 1500 games |
| 2026-11-19 17:28 PST | gate-309b7127-b9 | c3d-highcpu-60 | us-west1-c | 0.277 | 0.142 | exit 0 | load 68.0 of 60 mean, peak 13.4 GB | replay batch 9 at 309b7127, 40 workers, 3000 of 3000 games |
| 2026-11-19 17:25 PST | gate-309b7127-b10 | c3d-highcpu-60 | us-central1-a | 0.371 | 0.191 | exit 0 | load 63.3 of 60 mean, peak 15.1 GB | replay batch 10 at 309b7127, 40 workers, 3000 of 3000 games |
| 2026-11-19 17:44 PST | gate-309b7127-b15 | c3d-highcpu-60 | us-central1-c | 0.059 | 0.030 | exit 0 | load 50.0 of 60 mean, peak 10.0 GB | replay batch 15 at 309b7127, 40 workers, 618 of 618 games |
| 2026-11-19 17:46 PST | gate-309b7127-b13 | c3d-highcpu-60 | us-east1-c | 0.106 | 0.054 | exit 0 | load 63.9 of 60 mean, peak 11.3 GB | replay batch 13 at 309b7127, 40 workers, 1500 of 1500 games |
| 2026-11-19 17:48 PST | gate-309b7127-b14 | c3d-highcpu-60 | us-central1-a | 0.099 | 0.051 | exit 0 | load 59.3 of 60 mean, peak 10.5 GB | replay batch 14 at 309b7127, 40 workers, 1500 of 1500 games |
| 2026-11-19 17:51 PST | gate-309b7127-b20 | c3d-highcpu-60 | us-west1-c | 0.107 | 0.055 | exit 0 | load 49.1 of 60 mean, peak 10.1 GB | replay batch 20 at 309b7127, 40 workers, 605 of 605 games |
| 2026-11-19 17:53 PST | gate-309b7127-b17 | c3d-highcpu-60 | us-central1-a | 0.071 | 0.036 | exit 0 | load 48.6 of 60 mean, peak 10.5 GB | replay batch 17 at 309b7127, 40 workers, 605 of 605 games |
| 2026-11-19 17:55 PST | gate-309b7127-b18 | c3d-highcpu-60 | us-central1-c | 0.065 | 0.033 | exit 0 | load 44.3 of 60 mean, peak 9.2 GB | replay batch 18 at 309b7127, 40 workers, 605 of 605 games |
| 2026-11-19 17:58 PST | gate-309b7127-pilots | c3d-highcpu-60 | us-central1-a | 0.100 | 0.051 | exit 0 | load 61.2 of 60 mean, peak 10.0 GB | replay batch pilots at 309b7127, 40 workers, 1353 of 1353 games |
| 2026-11-19 18:07 PST | gate-1fce5aa1-b2 | c3d-highcpu-60 | us-central1-a | 0.096 | 0.049 | exit 0 | load 50.6 of 60 mean, peak 7.6 GB | replay batch 2 at 1fce5aa1, 40 workers, 5000 of 5000 games |
| 2026-11-19 18:07 PST | gate-1fce5aa1-b3 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 53.0 of 60 mean, peak 7.5 GB | replay batch 3 at 1fce5aa1, 40 workers, 5000 of 5000 games |
| 2026-11-19 18:08 PST | gate-1fce5aa1-b1 | c3d-highcpu-60 | us-west1-c | 0.097 | 0.050 | exit 0 | load 50.4 of 60 mean, peak 7.3 GB | replay batch 1 at 1fce5aa1, 40 workers, 5000 of 5000 games |
| 2026-11-19 18:07 PST | gate-1fce5aa1-b4 | c3d-highcpu-60 | us-east1-c | 0.169 | 0.087 | exit 0 | load 73.2 of 60 mean, peak 9.2 GB | replay batch 4 at 1fce5aa1, 40 workers, 5000 of 5000 games |
| 2026-11-19 18:13 PST | gate-1fce5aa1-b7 | c3d-highcpu-60 | us-central1-b | 0.276 | 0.142 | exit 0 | load 67.0 of 60 mean, peak 12.5 GB | replay batch 7 at 1fce5aa1, 40 workers, 3000 of 3000 games |
| 2026-11-19 18:13 PST | gate-1fce5aa1-b6 | c3d-highcpu-60 | us-central1-b | 0.348 | 0.179 | exit 0 | load 68.0 of 60 mean, peak 15.6 GB | replay batch 6 at 1fce5aa1, 40 workers, 3000 of 3000 games |
| 2026-11-19 18:19 PST | gate-1fce5aa1-b8 | c3d-highcpu-60 | us-east1-c | 0.311 | 0.160 | exit 0 | load 70.6 of 60 mean, peak 13.8 GB | replay batch 8 at 1fce5aa1, 40 workers, 3000 of 3000 games |
| 2026-11-19 18:15 PST | gate-1fce5aa1-b5 | c3d-highcpu-60 | us-west1-c | 0.385 | 0.198 | exit 0 | load 67.1 of 60 mean, peak 14.9 GB | replay batch 5 at 1fce5aa1, 40 workers, 3000 of 3000 games |
| 2026-11-19 18:30 PST | gate-1fce5aa1-b11 | c3d-highcpu-60 | us-central1-a | 0.132 | 0.068 | exit 0 | load 69.9 of 60 mean, peak 9.4 GB | replay batch 11 at 1fce5aa1, 40 workers, 1500 of 1500 games |
| 2026-11-19 18:40 PST | gate-1fce5aa1-b15 | c3d-highcpu-60 | us-west1-a | 0.059 | 0.030 | exit 0 | load 47.5 of 60 mean, peak 9.0 GB | replay batch 15 at 1fce5aa1, 40 workers, 618 of 618 games |
| 2026-11-19 18:38 PST | gate-1fce5aa1-b12 | c3d-highcpu-60 | us-east1-c | 0.131 | 0.067 | exit 0 | load 68.4 of 60 mean, peak 10.7 GB | replay batch 12 at 1fce5aa1, 40 workers, 1500 of 1500 games |
| 2026-11-19 18:45 PST | gate-1fce5aa1-b20 | c3d-highcpu-60 | us-west1-c | 0.094 | 0.048 | exit 0 | load 51.3 of 60 mean, peak 9.6 GB | replay batch 20 at 1fce5aa1, 40 workers, 605 of 605 games |
| 2026-11-19 18:48 PST | gate-1fce5aa1-b16 | c3d-highcpu-60 | us-west1-a | 0.057 | 0.029 | exit 0 | not sampled | replay batch 16 at 1fce5aa1, 40 workers, 106 of 106 games |
| 2026-11-19 18:52 PST | gate-1fce5aa1-b23 | c3d-highcpu-60 | us-east1-c | 0.053 | 0.027 | exit 0 | not sampled | replay batch 23 at 1fce5aa1, 40 workers, 600 of 600 games |
| 2026-11-19 18:39 PST | gate-1fce5aa1-b9 | c3d-highcpu-60 | us-central1-a | 0.307 | 0.158 | exit 0 | load 69.2 of 60 mean, peak 13.7 GB | replay batch 9 at 1fce5aa1, 40 workers, 3000 of 3000 games |
| 2026-11-19 18:35 PST | gate-1fce5aa1-b10 | c3d-highcpu-60 | us-central1-a | 0.416 | 0.214 | exit 0 | load 64.1 of 60 mean, peak 15.4 GB | replay batch 10 at 1fce5aa1, 40 workers, 3000 of 3000 games |
| 2026-11-19 18:58 PST | gate-1fce5aa1-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 72.4 of 60 mean, peak 10.8 GB | replay batch 13 at 1fce5aa1, 40 workers, 1500 of 1500 games |
| 2026-11-19 19:00 PST | gate-1fce5aa1-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 68.0 of 60 mean, peak 10.6 GB | replay batch 14 at 1fce5aa1, 40 workers, 1500 of 1500 games |
| 2026-11-19 19:06 PST | gate-1fce5aa1-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 51.2 of 60 mean, peak 10.4 GB | replay batch 17 at 1fce5aa1, 40 workers, 605 of 605 games |
| 2026-11-19 19:08 PST | gate-1fce5aa1-b18 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.5 of 60 mean, peak 9.9 GB | replay batch 18 at 1fce5aa1, 40 workers, 605 of 605 games |
| 2026-11-19 19:12 PST | gate-1fce5aa1-pilots | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 72.1 of 60 mean, peak 10.0 GB | replay batch pilots at 1fce5aa1, 40 workers, 1353 of 1353 games |
| 2026-11-19 19:35 PST | gate-7c523ffd-b8 | c3d-highcpu-60 | us-west1-a | 0.308 | 0.158 | exit 0 | load 69.9 of 60 mean, peak 12.8 GB | replay batch 8 at 7c523ffd, 40 workers, 3000 of 3000 games |
| 2026-11-19 19:35 PST | gate-7c523ffd-b6 | c3d-highcpu-60 | us-central1-a | 0.345 | 0.177 | exit 0 | load 66.6 of 60 mean, peak 14.5 GB | replay batch 6 at 7c523ffd, 40 workers, 3000 of 3000 games |
| 2026-11-19 19:35 PST | gate-7c523ffd-b10 | c3d-highcpu-60 | us-west1-a | 0.381 | 0.196 | exit 0 | load 64.7 of 60 mean, peak 16.4 GB | replay batch 10 at 7c523ffd, 40 workers, 3000 of 3000 games |
| 2026-11-19 19:35 PST | gate-7c523ffd-b5 | c3d-highcpu-60 | us-central1-a | 0.420 | 0.216 | exit 0 | load 68.2 of 60 mean, peak 15.3 GB | replay batch 5 at 7c523ffd, 40 workers, 3000 of 3000 games |
| 2026-11-19 20:00 PST | gate-7c523ffd-b11 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.066 | exit 0 | load 68.9 of 60 mean, peak 9.5 GB | replay batch 11 at 7c523ffd, 40 workers, 1500 of 1500 games |
| 2026-11-19 20:00 PST | gate-7c523ffd-b4 | c3d-highcpu-60 | us-west1-a | 0.167 | 0.086 | exit 0 | load 75.5 of 60 mean, peak 9.0 GB | replay batch 4 at 7c523ffd, 40 workers, 5000 of 5000 games |
| 2026-11-19 19:56 PST | gate-7c523ffd-b7 | c3d-highcpu-60 | us-central1-a | 0.275 | 0.141 | exit 0 | load 69.2 of 60 mean, peak 11.5 GB | replay batch 7 at 7c523ffd, 40 workers, 3000 of 3000 games |
| 2026-11-19 19:55 PST | gate-7c523ffd-b9 | c3d-highcpu-60 | us-east1-c | 0.312 | 0.160 | exit 0 | load 66.7 of 60 mean, peak 13.2 GB | replay batch 9 at 7c523ffd, 40 workers, 3000 of 3000 games |
| 2026-11-19 20:09 PST | gate-7c523ffd-pilots | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 69.9 of 60 mean, peak 11.0 GB | replay batch pilots at 7c523ffd, 40 workers, 1353 of 1353 games |
| 2026-11-19 20:11 PST | gate-7c523ffd-b20 | c3d-highcpu-60 | us-west1-a | 0.090 | 0.046 | exit 0 | load 47.3 of 60 mean, peak 10.6 GB | replay batch 20 at 7c523ffd, 40 workers, 605 of 605 games |
| 2026-11-19 20:13 PST | gate-7c523ffd-b13 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.066 | exit 0 | load 72.7 of 60 mean, peak 10.7 GB | replay batch 13 at 7c523ffd, 40 workers, 1500 of 1500 games |
| 2026-11-19 20:15 PST | gate-7c523ffd-b14 | c3d-highcpu-60 | us-east1-c | 0.129 | 0.066 | exit 0 | load 68.8 of 60 mean, peak 10.8 GB | replay batch 14 at 7c523ffd, 40 workers, 1500 of 1500 games |
| 2026-11-19 20:18 PST | gate-7c523ffd-b3 | c3d-highcpu-60 | us-west1-a | 0.096 | 0.049 | exit 0 | load 51.0 of 60 mean, peak 7.6 GB | replay batch 3 at 7c523ffd, 40 workers, 5000 of 5000 games |
| 2026-11-19 20:17 PST | gate-7c523ffd-b12 | c3d-highcpu-60 | us-central1-a | 0.137 | 0.070 | exit 0 | load 67.2 of 60 mean, peak 9.9 GB | replay batch 12 at 7c523ffd, 40 workers, 1500 of 1500 games |
| 2026-11-19 20:21 PST | gate-7c523ffd-b1 | c3d-highcpu-60 | us-central1-a | 0.100 | 0.051 | exit 0 | load 53.4 of 60 mean, peak 7.2 GB | replay batch 1 at 7c523ffd, 40 workers, 5000 of 5000 games |
| 2026-11-19 20:25 PST | gate-7c523ffd-b17 | c3d-highcpu-60 | us-west1-a | 0.057 | 0.029 | exit 0 | load 52.3 of 60 mean, peak 10.5 GB | replay batch 17 at 7c523ffd, 40 workers, 605 of 605 games |
| 2026-11-19 20:26 PST | gate-7c523ffd-b18 | c3d-highcpu-60 | us-central1-a | 0.057 | 0.029 | exit 0 | load 48.5 of 60 mean, peak 10.0 GB | replay batch 18 at 7c523ffd, 40 workers, 605 of 605 games |
| 2026-11-19 20:25 PST | gate-7c523ffd-b2 | c3d-highcpu-60 | us-east1-c | 0.094 | 0.048 | exit 0 | load 53.5 of 60 mean, peak 7.6 GB | replay batch 2 at 7c523ffd, 40 workers, 5000 of 5000 games |
| 2026-11-19 20:29 PST | gate-7c523ffd-b16 | c3d-highcpu-60 | us-central1-b | 0.054 | 0.028 | exit 0 | not sampled | replay batch 16 at 7c523ffd, 40 workers, 106 of 106 games |
| 2026-11-19 20:28 PST | gate-7c523ffd-b15 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 53.5 of 60 mean, peak 10.3 GB | replay batch 15 at 7c523ffd, 40 workers, 618 of 618 games |
| 2026-11-19 20:31 PST | gate-7c523ffd-b23 | c3d-highcpu-60 | us-east1-c | 0.054 | 0.028 | exit 0 | not sampled | replay batch 23 at 7c523ffd, 40 workers, 600 of 600 games |
| 2026-11-19 21:31 PST | gate-055d2656-b8 | c3d-highcpu-60 | us-central1-a | 0.310 | 0.159 | exit 0 | load 67.0 of 60 mean, peak 12.4 GB | replay batch 8 at 055d2656, 40 workers, 3000 of 3000 games |
| 2026-11-19 21:31 PST | gate-055d2656-b6 | c3d-highcpu-60 | us-east1-c | 0.345 | 0.177 | exit 0 | load 67.6 of 60 mean, peak 14.9 GB | replay batch 6 at 055d2656, 40 workers, 3000 of 3000 games |
| 2026-11-19 21:31 PST | gate-055d2656-b5 | c3d-highcpu-60 | us-central1-a | 0.381 | 0.196 | exit 0 | load 67.1 of 60 mean, peak 13.5 GB | replay batch 5 at 055d2656, 40 workers, 3000 of 3000 games |
| 2026-11-19 21:32 PST | gate-055d2656-b10 | c3d-highcpu-60 | us-west1-a | 0.380 | 0.195 | exit 0 | load 64.1 of 60 mean, peak 15.1 GB | replay batch 10 at 055d2656, 40 workers, 3000 of 3000 games |
| 2026-11-19 21:56 PST | gate-055d2656-b12 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.064 | exit 0 | load 68.6 of 60 mean, peak 10.6 GB | replay batch 12 at 055d2656, 40 workers, 1500 of 1500 games |
| 2026-11-19 21:54 PST | gate-055d2656-b4 | c3d-highcpu-60 | us-central1-a | 0.161 | 0.083 | exit 0 | load 74.8 of 60 mean, peak 9.0 GB | replay batch 4 at 055d2656, 40 workers, 5000 of 5000 games |
| 2026-11-19 21:50 PST | gate-055d2656-b9 | c3d-highcpu-60 | us-central1-a | 0.302 | 0.155 | exit 0 | load 68.5 of 60 mean, peak 13.1 GB | replay batch 9 at 055d2656, 40 workers, 3000 of 3000 games |
| 2026-11-19 21:53 PST | gate-055d2656-b7 | c3d-highcpu-60 | us-east1-c | 0.267 | 0.137 | exit 0 | load 67.5 of 60 mean, peak 11.8 GB | replay batch 7 at 055d2656, 40 workers, 3000 of 3000 games |
| 2026-11-19 22:04 PST | gate-055d2656-b11 | c3d-highcpu-60 | us-central1-b | 0.125 | 0.064 | exit 0 | load 65.3 of 60 mean, peak 10.2 GB | replay batch 11 at 055d2656, 40 workers, 1500 of 1500 games |
| 2026-11-19 22:05 PST | gate-055d2656-b13 | c3d-highcpu-60 | us-west1-a | 0.124 | 0.064 | exit 0 | load 73.2 of 60 mean, peak 11.4 GB | replay batch 13 at 055d2656, 40 workers, 1500 of 1500 games |
| 2026-11-19 22:09 PST | gate-055d2656-b14 | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 69.1 of 60 mean, peak 9.9 GB | replay batch 14 at 055d2656, 40 workers, 1500 of 1500 games |
| 2026-11-19 22:12 PST | gate-055d2656-b1 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 49.8 of 60 mean, peak 7.4 GB | replay batch 1 at 055d2656, 40 workers, 5000 of 5000 games |
| 2026-11-19 22:10 PST | gate-055d2656-pilots | c3d-highcpu-60 | us-east1-c | 0.126 | 0.065 | exit 0 | load 63.3 of 60 mean, peak 10.4 GB | replay batch pilots at 055d2656, 40 workers, 1353 of 1353 games |
| 2026-11-19 22:14 PST | gate-055d2656-b3 | c3d-highcpu-60 | us-west1-a | 0.138 | 0.071 | exit 0 | load 48.9 of 60 mean, peak 7.1 GB | replay batch 3 at 055d2656, 40 workers, 5000 of 5000 games |
| 2026-11-19 22:17 PST | gate-055d2656-b2 | c3d-highcpu-60 | us-central1-a | 0.115 | 0.059 | exit 0 | load 55.6 of 60 mean, peak 7.3 GB | replay batch 2 at 055d2656, 40 workers, 5000 of 5000 games |
| 2026-11-19 22:21 PST | gate-055d2656-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 45.3 of 60 mean, peak 10.5 GB | replay batch 17 at 055d2656, 40 workers, 605 of 605 games |
| 2026-11-19 22:22 PST | gate-055d2656-b20 | c3d-highcpu-60 | us-east1-c | 0.096 | 0.049 | exit 0 | load 49.3 of 60 mean, peak 10.3 GB | replay batch 20 at 055d2656, 40 workers, 605 of 605 games |
| 2026-11-19 22:24 PST | gate-055d2656-b15 | c3d-highcpu-60 | us-central1-a | 0.067 | 0.034 | exit 0 | load 50.0 of 60 mean, peak 9.7 GB | replay batch 15 at 055d2656, 40 workers, 618 of 618 games |
| 2026-11-19 22:23 PST | gate-055d2656-b18 | c3d-highcpu-60 | us-west1-a | 0.116 | 0.060 | exit 0 | load 49.4 of 60 mean, peak 10.1 GB | replay batch 18 at 055d2656, 40 workers, 605 of 605 games |
| 2026-11-19 22:29 PST | gate-055d2656-b16 | c3d-highcpu-60 | us-central1-a | 0.057 | 0.029 | exit 0 | not sampled | replay batch 16 at 055d2656, 40 workers, 106 of 106 games |
| 2026-11-19 22:31 PST | gate-055d2656-b23 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | not sampled | replay batch 23 at 055d2656, 40 workers, 600 of 600 games |
| 2026-11-20 02:00 PST | gate-4cc9f800-b8 | c3d-highcpu-60 | us-central1-a | 0.295 | 0.152 | exit 0 | load 68.0 of 60 mean, peak 13.0 GB | replay batch 8 at 4cc9f800, 40 workers, 3000 of 3000 games |
| 2026-11-20 02:00 PST | gate-4cc9f800-b5 | c3d-highcpu-60 | us-central1-a | 0.364 | 0.187 | exit 0 | load 67.1 of 60 mean, peak 14.6 GB | replay batch 5 at 4cc9f800, 40 workers, 3000 of 3000 games |
| 2026-11-20 02:01 PST | gate-4cc9f800-b6 | c3d-highcpu-60 | us-east1-c | 0.364 | 0.187 | exit 0 | load 67.9 of 60 mean, peak 14.6 GB | replay batch 6 at 4cc9f800, 40 workers, 3000 of 3000 games |
| 2026-11-20 02:01 PST | gate-4cc9f800-b10 | c3d-highcpu-60 | us-west1-a | 0.398 | 0.205 | exit 0 | load 65.6 of 60 mean, peak 15.1 GB | replay batch 10 at 4cc9f800, 40 workers, 3000 of 3000 games |
| 2026-11-20 02:24 PST | gate-4cc9f800-b4 | c3d-highcpu-60 | us-east1-c | 0.156 | 0.080 | exit 0 | load 77.1 of 60 mean, peak 9.0 GB | replay batch 4 at 4cc9f800, 40 workers, 5000 of 5000 games |
| 2026-11-20 02:26 PST | gate-4cc9f800-b12 | c3d-highcpu-60 | us-west1-a | 0.122 | 0.063 | exit 0 | load 69.4 of 60 mean, peak 10.8 GB | replay batch 12 at 4cc9f800, 40 workers, 1500 of 1500 games |
| 2026-11-20 02:19 PST | gate-4cc9f800-b9 | c3d-highcpu-60 | us-central1-a | 0.294 | 0.151 | exit 0 | load 68.7 of 60 mean, peak 12.7 GB | replay batch 9 at 4cc9f800, 40 workers, 3000 of 3000 games |
| 2026-11-20 02:23 PST | gate-4cc9f800-b7 | c3d-highcpu-60 | us-central1-a | 0.260 | 0.134 | exit 0 | load 69.5 of 60 mean, peak 11.7 GB | replay batch 7 at 4cc9f800, 40 workers, 3000 of 3000 games |
| 2026-11-20 02:34 PST | gate-4cc9f800-b11 | c3d-highcpu-60 | us-east1-c | 0.122 | 0.063 | exit 0 | load 65.9 of 60 mean, peak 10.2 GB | replay batch 11 at 4cc9f800, 40 workers, 1500 of 1500 games |
| 2026-11-20 02:35 PST | gate-4cc9f800-b14 | c3d-highcpu-60 | us-west1-a | 0.120 | 0.062 | exit 0 | load 69.7 of 60 mean, peak 10.5 GB | replay batch 14 at 4cc9f800, 40 workers, 1500 of 1500 games |
| 2026-11-20 02:37 PST | gate-4cc9f800-pilots | c3d-highcpu-60 | us-central1-a | 0.121 | 0.062 | exit 0 | load 72.8 of 60 mean, peak 10.2 GB | replay batch pilots at 4cc9f800, 40 workers, 1353 of 1353 games |
| 2026-11-20 02:39 PST | gate-4cc9f800-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 71.0 of 60 mean, peak 10.2 GB | replay batch 13 at 4cc9f800, 40 workers, 1500 of 1500 games |
| 2026-11-20 02:43 PST | gate-4cc9f800-b1 | c3d-highcpu-60 | us-east1-c | 0.087 | 0.045 | exit 0 | load 50.2 of 60 mean, peak 8.0 GB | replay batch 1 at 4cc9f800, 40 workers, 5000 of 5000 games |
| 2026-11-20 02:43 PST | gate-4cc9f800-b3 | c3d-highcpu-60 | us-west1-a | 0.088 | 0.045 | exit 0 | load 51.4 of 60 mean, peak 7.7 GB | replay batch 3 at 4cc9f800, 40 workers, 5000 of 5000 games |
| 2026-11-20 02:44 PST | gate-4cc9f800-b2 | c3d-highcpu-60 | us-central1-a | 0.087 | 0.045 | exit 0 | load 55.0 of 60 mean, peak 7.5 GB | replay batch 2 at 4cc9f800, 40 workers, 5000 of 5000 games |
| 2026-11-20 02:47 PST | gate-4cc9f800-b20 | c3d-highcpu-60 | us-central1-a | 0.086 | 0.044 | exit 0 | load 51.2 of 60 mean, peak 10.1 GB | replay batch 20 at 4cc9f800, 40 workers, 605 of 605 games |
| 2026-11-20 02:49 PST | gate-4cc9f800-b17 | c3d-highcpu-60 | us-east1-c | 0.086 | 0.044 | exit 0 | load 50.0 of 60 mean, peak 10.2 GB | replay batch 17 at 4cc9f800, 40 workers, 605 of 605 games |
| 2026-11-20 02:49 PST | gate-4cc9f800-b18 | c3d-highcpu-60 | us-west1-a | 0.086 | 0.044 | exit 0 | load 47.6 of 60 mean, peak 9.9 GB | replay batch 18 at 4cc9f800, 40 workers, 605 of 605 games |
| 2026-11-20 02:50 PST | gate-4cc9f800-b15 | c3d-highcpu-60 | us-central1-a | 0.086 | 0.044 | exit 0 | load 50.1 of 60 mean, peak 10.1 GB | replay batch 15 at 4cc9f800, 40 workers, 618 of 618 games |
| 2026-11-20 02:52 PST | gate-4cc9f800-b16 | c3d-highcpu-60 | us-central1-a | 0.052 | 0.027 | exit 0 | not sampled | replay batch 16 at 4cc9f800, 40 workers, 106 of 106 games |
| 2026-11-20 02:55 PST | gate-4cc9f800-b23 | c3d-highcpu-60 | us-east1-c | 0.052 | 0.027 | exit 0 | not sampled | replay batch 23 at 4cc9f800, 40 workers, 600 of 600 games |
| 2026-11-20 08:59 PST | gate-f7dadadf-b8 | c3d-highcpu-60 | us-central1-a | 0.346 | 0.178 | exit 0 | load 66.3 of 60 mean, peak 13.1 GB | replay batch 8 at f7dadadf, 40 workers, 3000 of 3000 games |
| 2026-11-20 08:59 PST | gate-f7dadadf-b5 | c3d-highcpu-60 | us-east1-b | 0.383 | 0.197 | exit 0 | load 67.7 of 60 mean, peak 14.7 GB | replay batch 5 at f7dadadf, 40 workers, 3000 of 3000 games |
| 2026-11-20 08:58 PST | gate-f7dadadf-b10 | c3d-highcpu-60 | us-central1-a | 0.455 | 0.234 | exit 0 | load 65.2 of 60 mean, peak 14.7 GB | replay batch 10 at f7dadadf, 40 workers, 3000 of 3000 games |
| 2026-11-20 09:07 PST | gate-f7dadadf-b6 | c3d-highcpu-60 | us-west1-c | 0.339 | 0.174 | exit 0 | load 66.5 of 60 mean, peak 14.9 GB | replay batch 6 at f7dadadf, 40 workers, 3000 of 3000 games |
| 2026-11-20 09:26 PST | gate-f7dadadf-b4 | c3d-highcpu-60 | us-central1-a | 0.158 | 0.081 | exit 0 | load 74.1 of 60 mean, peak 9.1 GB | replay batch 4 at f7dadadf, 40 workers, 5000 of 5000 games |
| 2026-11-20 09:29 PST | gate-f7dadadf-b12 | c3d-highcpu-60 | us-west1-c | 0.127 | 0.065 | exit 0 | load 69.9 of 60 mean, peak 10.5 GB | replay batch 12 at f7dadadf, 40 workers, 1500 of 1500 games |
| 2026-11-20 09:20 PST | gate-f7dadadf-b9 | c3d-highcpu-60 | us-central1-a | 0.302 | 0.155 | exit 0 | load 68.7 of 60 mean, peak 12.9 GB | replay batch 9 at f7dadadf, 40 workers, 3000 of 3000 games |
| 2026-11-20 09:23 PST | gate-f7dadadf-b7 | c3d-highcpu-60 | us-east1-c | 0.270 | 0.139 | exit 0 | load 67.6 of 60 mean, peak 12.6 GB | replay batch 7 at f7dadadf, 40 workers, 3000 of 3000 games |
| 2026-11-20 09:36 PST | gate-f7dadadf-b11 | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 67.4 of 60 mean, peak 9.8 GB | replay batch 11 at f7dadadf, 40 workers, 1500 of 1500 games |
| 2026-11-20 09:39 PST | gate-f7dadadf-b14 | c3d-highcpu-60 | us-west1-c | 0.127 | 0.065 | exit 0 | load 68.9 of 60 mean, peak 10.2 GB | replay batch 14 at f7dadadf, 40 workers, 1500 of 1500 games |
| 2026-11-20 09:39 PST | gate-f7dadadf-pilots | c3d-highcpu-60 | us-central1-a | 0.125 | 0.064 | exit 0 | load 66.8 of 60 mean, peak 10.0 GB | replay batch pilots at f7dadadf, 40 workers, 1353 of 1353 games |
| 2026-11-20 09:41 PST | gate-f7dadadf-b13 | c3d-highcpu-60 | us-east1-c | 0.127 | 0.065 | exit 0 | load 73.1 of 60 mean, peak 10.2 GB | replay batch 13 at f7dadadf, 40 workers, 1500 of 1500 games |
| 2026-11-20 09:44 PST | gate-f7dadadf-b1 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 50.8 of 60 mean, peak 7.6 GB | replay batch 1 at f7dadadf, 40 workers, 5000 of 5000 games |
| 2026-11-20 09:47 PST | gate-f7dadadf-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 52.9 of 60 mean, peak 7.4 GB | replay batch 3 at f7dadadf, 40 workers, 5000 of 5000 games |
| 2026-11-20 09:48 PST | gate-f7dadadf-b2 | c3d-highcpu-60 | us-west1-c | 0.090 | 0.046 | exit 0 | load 50.3 of 60 mean, peak 7.6 GB | replay batch 2 at f7dadadf, 40 workers, 5000 of 5000 games |
| 2026-11-20 09:50 PST | gate-f7dadadf-b20 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.046 | exit 0 | load 44.4 of 60 mean, peak 9.9 GB | replay batch 20 at f7dadadf, 40 workers, 605 of 605 games |
| 2026-11-20 09:50 PST | gate-f7dadadf-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.0 of 60 mean, peak 10.2 GB | replay batch 17 at f7dadadf, 40 workers, 605 of 605 games |
| 2026-11-20 09:53 PST | gate-f7dadadf-b18 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 50.7 of 60 mean, peak 9.8 GB | replay batch 18 at f7dadadf, 40 workers, 605 of 605 games |
| 2026-11-20 09:56 PST | gate-f7dadadf-b16 | c3d-highcpu-60 | us-central1-c | 0.054 | 0.028 | exit 0 | not sampled | replay batch 16 at f7dadadf, 40 workers, 106 of 106 games |
| 2026-11-20 09:57 PST | gate-f7dadadf-b23 | c3d-highcpu-60 | us-east1-c | 0.057 | 0.029 | exit 0 | not sampled | replay batch 23 at f7dadadf, 40 workers, 600 of 600 games |
| 2026-11-20 09:55 PST | gate-f7dadadf-b15 | c3d-highcpu-60 | us-west1-a | 0.094 | 0.048 | exit 0 | load 49.1 of 60 mean, peak 10.1 GB | replay batch 15 at f7dadadf, 40 workers, 618 of 618 games |
| 2026-11-20 11:05 PST | gate-307af0f1-b8 | c3d-highcpu-60 | us-central1-a | 0.304 | 0.156 | exit 0 | load 69.0 of 60 mean, peak 12.8 GB | replay batch 8 at 307af0f1, 40 workers, 3000 of 3000 games |
| 2026-11-20 11:06 PST | gate-307af0f1-b6 | c3d-highcpu-60 | us-east1-c | 0.341 | 0.175 | exit 0 | load 67.9 of 60 mean, peak 15.1 GB | replay batch 6 at 307af0f1, 40 workers, 3000 of 3000 games |
| 2026-11-20 11:06 PST | gate-307af0f1-b10 | c3d-highcpu-60 | us-west1-c | 0.375 | 0.193 | exit 0 | load 65.1 of 60 mean, peak 15.4 GB | replay batch 10 at 307af0f1, 40 workers, 3000 of 3000 games |
| 2026-11-20 11:05 PST | gate-307af0f1-b5 | c3d-highcpu-60 | us-central1-a | 0.447 | 0.230 | exit 0 | load 67.1 of 60 mean, peak 15.7 GB | replay batch 5 at 307af0f1, 40 workers, 3000 of 3000 games |
| 2026-11-20 11:32 PST | gate-307af0f1-b12 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 67.8 of 60 mean, peak 9.6 GB | replay batch 12 at 307af0f1, 40 workers, 1500 of 1500 games |
| 2026-11-20 11:30 PST | gate-307af0f1-b4 | c3d-highcpu-60 | us-west1-c | 0.162 | 0.083 | exit 0 | load 72.9 of 60 mean, peak 8.9 GB | replay batch 4 at 307af0f1, 40 workers, 5000 of 5000 games |
| 2026-11-20 11:27 PST | gate-307af0f1-b7 | c3d-highcpu-60 | us-east1-c | 0.234 | 0.120 | exit 0 | load 67.5 of 60 mean, peak 12.0 GB | replay batch 7 at 307af0f1, 40 workers, 3000 of 3000 games |
| 2026-11-20 11:24 PST | gate-307af0f1-b9 | c3d-highcpu-60 | us-central1-a | 0.340 | 0.175 | exit 0 | load 65.9 of 60 mean, peak 13.1 GB | replay batch 9 at 307af0f1, 40 workers, 3000 of 3000 games |
| 2026-11-20 11:40 PST | gate-307af0f1-b13 | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 70.6 of 60 mean, peak 10.1 GB | replay batch 13 at 307af0f1, 40 workers, 1500 of 1500 games |
| 2026-11-20 11:42 PST | gate-307af0f1-b14 | c3d-highcpu-60 | us-west1-c | 0.126 | 0.065 | exit 0 | load 69.0 of 60 mean, peak 10.4 GB | replay batch 14 at 307af0f1, 40 workers, 1500 of 1500 games |
| 2026-11-20 11:43 PST | gate-307af0f1-b11 | c3d-highcpu-60 | us-east1-c | 0.127 | 0.065 | exit 0 | load 69.0 of 60 mean, peak 10.0 GB | replay batch 11 at 307af0f1, 40 workers, 1500 of 1500 games |
| 2026-11-20 11:45 PST | gate-307af0f1-pilots | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 67.7 of 60 mean, peak 11.0 GB | replay batch pilots at 307af0f1, 40 workers, 1353 of 1353 games |
| 2026-11-20 11:49 PST | gate-307af0f1-b3 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 50.3 of 60 mean, peak 7.7 GB | replay batch 3 at 307af0f1, 40 workers, 5000 of 5000 games |
| 2026-11-20 11:51 PST | gate-307af0f1-b2 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.046 | exit 0 | load 51.0 of 60 mean, peak 7.9 GB | replay batch 2 at 307af0f1, 40 workers, 5000 of 5000 games |
| 2026-11-20 11:52 PST | gate-307af0f1-b1 | c3d-highcpu-60 | us-west1-c | 0.091 | 0.047 | exit 0 | load 51.0 of 60 mean, peak 7.9 GB | replay batch 1 at 307af0f1, 40 workers, 5000 of 5000 games |
| 2026-11-20 11:53 PST | gate-307af0f1-b15 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 49.0 of 60 mean, peak 10.1 GB | replay batch 15 at 307af0f1, 40 workers, 618 of 618 games |
| 2026-11-20 11:55 PST | gate-307af0f1-b18 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 47.0 of 60 mean, peak 10.3 GB | replay batch 18 at 307af0f1, 40 workers, 605 of 605 games |
| 2026-11-20 11:57 PST | gate-307af0f1-b20 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.046 | exit 0 | load 46.9 of 60 mean, peak 10.4 GB | replay batch 20 at 307af0f1, 40 workers, 605 of 605 games |
| 2026-11-20 11:59 PST | gate-307af0f1-b16 | c3d-highcpu-60 | us-west1-c | 0.053 | 0.027 | exit 0 | not sampled | replay batch 16 at 307af0f1, 40 workers, 106 of 106 games |
| 2026-11-20 11:58 PST | gate-307af0f1-b17 | c3d-highcpu-60 | us-central1-f | 0.088 | 0.045 | exit 0 | load 48.5 of 60 mean, peak 11.0 GB | replay batch 17 at 307af0f1, 40 workers, 605 of 605 games |
| 2026-11-20 12:01 PST | gate-307af0f1-b23 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.027 | exit 0 | not sampled | replay batch 23 at 307af0f1, 40 workers, 600 of 600 games |
| 2026-11-20 12:36 PST | b24-p1 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | not sampled | record batch 24 at f7dadadf, 40 workers, 40 of 40 games |
| 2026-11-20 12:37 PST | b24-p2 | c3d-highcpu-60 | us-central1-a | 0.055 | 0.028 | exit 0 | not sampled | record batch 24 at f7dadadf, 40 workers, 40 of 40 games |
| 2026-11-20 12:43 PST | b24-p3 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | not sampled | record batch 24 at f7dadadf, 40 workers, 40 of 40 games |
| 2026-11-20 13:13 PST | gate-950eedcb-b8 | c3d-highcpu-60 | us-central1-a | 0.339 | 0.174 | exit 0 | load 69.1 of 60 mean, peak 14.6 GB | replay batch 8 at 950eedcb, 40 workers, 3000 of 3000 games |
| 2026-11-20 13:13 PST | gate-950eedcb-b5 | c3d-highcpu-60 | us-east1-b | 0.374 | 0.192 | exit 0 | load 66.3 of 60 mean, peak 14.7 GB | replay batch 5 at 950eedcb, 40 workers, 3000 of 3000 games |
| 2026-11-20 13:14 PST | gate-950eedcb-b6 | c3d-highcpu-60 | us-west1-c | 0.410 | 0.211 | exit 0 | load 68.5 of 60 mean, peak 15.2 GB | replay batch 6 at 950eedcb, 40 workers, 3000 of 3000 games |
| 2026-11-20 13:13 PST | gate-950eedcb-b10 | c3d-highcpu-60 | us-central1-a | 0.448 | 0.230 | exit 0 | load 64.4 of 60 mean, peak 15.4 GB | replay batch 10 at 950eedcb, 40 workers, 3000 of 3000 games |
| 2026-11-20 13:40 PST | gate-950eedcb-b12 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 68.0 of 60 mean, peak 9.8 GB | replay batch 12 at 950eedcb, 40 workers, 1500 of 1500 games |
| 2026-11-20 13:40 PST | gate-950eedcb-b4 | c3d-highcpu-60 | us-west1-c | 0.158 | 0.081 | exit 0 | load 73.7 of 60 mean, peak 9.4 GB | replay batch 4 at 950eedcb, 40 workers, 5000 of 5000 games |
| 2026-11-20 13:37 PST | gate-950eedcb-b7 | c3d-highcpu-60 | us-east1-b | 0.264 | 0.136 | exit 0 | load 68.6 of 60 mean, peak 11.8 GB | replay batch 7 at 950eedcb, 40 workers, 3000 of 3000 games |
| 2026-11-20 13:33 PST | gate-950eedcb-b9 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 67.5 of 60 mean, peak 13.8 GB | replay batch 9 at 950eedcb, 40 workers, 3000 of 3000 games |
| 2026-11-20 13:48 PST | gate-950eedcb-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 68.7 of 60 mean, peak 9.9 GB | replay batch 11 at 950eedcb, 40 workers, 1500 of 1500 games |
| 2026-11-20 13:51 PST | gate-950eedcb-b13 | c3d-highcpu-60 | us-west1-c | 0.123 | 0.063 | exit 0 | load 73.3 of 60 mean, peak 10.6 GB | replay batch 13 at 950eedcb, 40 workers, 1500 of 1500 games |
| 2026-11-20 13:56 PST | gate-950eedcb-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.9 of 60 mean, peak 7.5 GB | replay batch 1 at 950eedcb, 40 workers, 5000 of 5000 games |
| 2026-11-20 13:54 PST | gate-950eedcb-pilots | c3d-highcpu-60 | us-central1-a | 0.123 | 0.063 | exit 0 | load 66.9 of 60 mean, peak 10.4 GB | replay batch pilots at 950eedcb, 40 workers, 1353 of 1353 games |
| 2026-11-20 13:56 PST | gate-950eedcb-b14 | c3d-highcpu-60 | us-east1-b | 0.123 | 0.063 | exit 0 | load 68.9 of 60 mean, peak 11.0 GB | replay batch 14 at 950eedcb, 40 workers, 1500 of 1500 games |
| 2026-11-20 14:02 PST | gate-950eedcb-b15 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 48.7 of 60 mean, peak 10.4 GB | replay batch 15 at 950eedcb, 40 workers, 618 of 618 games |
| 2026-11-20 14:02 PST | gate-950eedcb-b18 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 45.8 of 60 mean, peak 9.5 GB | replay batch 18 at 950eedcb, 40 workers, 605 of 605 games |
| 2026-11-20 14:00 PST | gate-950eedcb-b3 | c3d-highcpu-60 | us-west1-c | 0.124 | 0.064 | exit 0 | load 54.5 of 60 mean, peak 7.3 GB | replay batch 3 at 950eedcb, 40 workers, 5000 of 5000 games |
| 2026-11-20 14:04 PST | gate-950eedcb-b2 | c3d-highcpu-60 | us-east1-b | 0.088 | 0.045 | exit 0 | load 49.4 of 60 mean, peak 7.7 GB | replay batch 2 at 950eedcb, 40 workers, 5000 of 5000 games |
| 2026-11-20 14:09 PST | gate-950eedcb-b16 | c3d-highcpu-60 | us-west1-c | 0.053 | 0.027 | exit 0 | not sampled | replay batch 16 at 950eedcb, 40 workers, 106 of 106 games |
| 2026-11-20 14:08 PST | gate-950eedcb-b17 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 48.0 of 60 mean, peak 9.9 GB | replay batch 17 at 950eedcb, 40 workers, 605 of 605 games |
| 2026-11-20 14:08 PST | gate-950eedcb-b20 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.4 of 60 mean, peak 10.2 GB | replay batch 20 at 950eedcb, 40 workers, 605 of 605 games |
| 2026-11-20 14:10 PST | gate-950eedcb-b23 | c3d-highcpu-60 | us-east1-b | 0.053 | 0.027 | exit 0 | not sampled | replay batch 23 at 950eedcb, 40 workers, 600 of 600 games |
| 2026-11-20 15:27 PST | gate-93af2128-b8 | c3d-highcpu-60 | us-east1-b | 0.300 | 0.154 | exit 0 | load 68.1 of 60 mean, peak 13.2 GB | replay batch 8 at 93af2128, 40 workers, 3000 of 3000 games |
| 2026-11-20 15:28 PST | gate-93af2128-b6 | c3d-highcpu-60 | us-west1-c | 0.335 | 0.172 | exit 0 | load 67.6 of 60 mean, peak 14.6 GB | replay batch 6 at 93af2128, 40 workers, 3000 of 3000 games |
| 2026-11-20 15:27 PST | gate-93af2128-b5 | c3d-highcpu-60 | us-central1-a | 0.371 | 0.191 | exit 0 | load 67.3 of 60 mean, peak 13.6 GB | replay batch 5 at 93af2128, 40 workers, 3000 of 3000 games |
| 2026-11-20 15:27 PST | gate-93af2128-b10 | c3d-highcpu-60 | us-central1-a | 0.407 | 0.209 | exit 0 | load 63.8 of 60 mean, peak 15.4 GB | replay batch 10 at 93af2128, 40 workers, 3000 of 3000 games |
| 2026-11-20 15:50 PST | gate-93af2128-b4 | c3d-highcpu-60 | us-central1-a | 0.162 | 0.083 | exit 0 | load 73.5 of 60 mean, peak 8.5 GB | replay batch 4 at 93af2128, 40 workers, 5000 of 5000 games |
| 2026-11-20 15:52 PST | gate-93af2128-b12 | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 69.6 of 60 mean, peak 10.0 GB | replay batch 12 at 93af2128, 40 workers, 1500 of 1500 games |
| 2026-11-20 15:46 PST | gate-93af2128-b9 | c3d-highcpu-60 | us-east1-c | 0.307 | 0.158 | exit 0 | load 68.0 of 60 mean, peak 13.5 GB | replay batch 9 at 93af2128, 40 workers, 3000 of 3000 games |
| 2026-11-20 15:49 PST | gate-93af2128-b7 | c3d-highcpu-60 | us-west1-c | 0.269 | 0.138 | exit 0 | load 67.5 of 60 mean, peak 11.5 GB | replay batch 7 at 93af2128, 40 workers, 3000 of 3000 games |
| 2026-11-20 16:00 PST | gate-93af2128-b11 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.066 | exit 0 | load 65.1 of 60 mean, peak 9.2 GB | replay batch 11 at 93af2128, 40 workers, 1500 of 1500 games |
| 2026-11-20 16:00 PST | gate-93af2128-b13 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 71.4 of 60 mean, peak 10.6 GB | replay batch 13 at 93af2128, 40 workers, 1500 of 1500 games |
| 2026-11-20 16:08 PST | gate-93af2128-b1 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 52.4 of 60 mean, peak 7.5 GB | replay batch 1 at 93af2128, 40 workers, 5000 of 5000 games |
| 2026-11-20 16:08 PST | gate-93af2128-b3 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 50.2 of 60 mean, peak 8.1 GB | replay batch 3 at 93af2128, 40 workers, 5000 of 5000 games |
| 2026-11-20 16:06 PST | gate-93af2128-b14 | c3d-highcpu-60 | us-east1-c | 0.127 | 0.065 | exit 0 | load 72.0 of 60 mean, peak 10.8 GB | replay batch 14 at 93af2128, 40 workers, 1500 of 1500 games |
| 2026-11-20 16:07 PST | gate-93af2128-pilots | c3d-highcpu-60 | us-west1-c | 0.128 | 0.066 | exit 0 | load 65.4 of 60 mean, peak 10.5 GB | replay batch pilots at 93af2128, 40 workers, 1353 of 1353 games |
| 2026-11-20 16:14 PST | gate-93af2128-b15 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 50.9 of 60 mean, peak 9.8 GB | replay batch 15 at 93af2128, 40 workers, 618 of 618 games |
| 2026-11-20 16:14 PST | gate-93af2128-b2 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 49.4 of 60 mean, peak 7.6 GB | replay batch 2 at 93af2128, 40 workers, 5000 of 5000 games |
| 2026-11-20 16:15 PST | gate-93af2128-b18 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.046 | exit 0 | load 46.9 of 60 mean, peak 10.1 GB | replay batch 18 at 93af2128, 40 workers, 605 of 605 games |
| 2026-11-20 16:16 PST | gate-93af2128-b20 | c3d-highcpu-60 | us-west1-c | 0.090 | 0.046 | exit 0 | load 49.1 of 60 mean, peak 9.5 GB | replay batch 20 at 93af2128, 40 workers, 605 of 605 games |
| 2026-11-20 16:20 PST | gate-93af2128-b16 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | not sampled | replay batch 16 at 93af2128, 40 workers, 106 of 106 games |
| 2026-11-20 16:21 PST | gate-93af2128-b23 | c3d-highcpu-60 | us-east1-c | 0.053 | 0.027 | exit 0 | not sampled | replay batch 23 at 93af2128, 40 workers, 600 of 600 games |
| 2026-11-20 16:20 PST | gate-93af2128-b17 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 46.7 of 60 mean, peak 9.3 GB | replay batch 17 at 93af2128, 40 workers, 605 of 605 games |
| 2026-11-20 16:42 PST | gate-66e039d4-b9 | c3d-highcpu-60 | us-central1-a | 0.306 | 0.157 | exit 0 | load 67.5 of 60 mean, peak 13.7 GB | replay batch 9 at 66e039d4, 40 workers, 3000 of 3000 games |
| 2026-11-20 16:42 PST | gate-66e039d4-b6 | c3d-highcpu-60 | us-central1-a | 0.342 | 0.176 | exit 0 | load 67.4 of 60 mean, peak 14.7 GB | replay batch 6 at 66e039d4, 40 workers, 3000 of 3000 games |
| 2026-11-20 16:42 PST | gate-66e039d4-b5 | c3d-highcpu-60 | us-east1-c | 0.379 | 0.195 | exit 0 | load 67.6 of 60 mean, peak 14.6 GB | replay batch 5 at 66e039d4, 40 workers, 3000 of 3000 games |
| 2026-11-20 16:43 PST | gate-66e039d4-b10 | c3d-highcpu-60 | us-west1-c | 0.378 | 0.194 | exit 0 | load 64.2 of 60 mean, peak 15.1 GB | replay batch 10 at 66e039d4, 40 workers, 3000 of 3000 games |
| 2026-11-20 17:07 PST | gate-66e039d4-b11 | c3d-highcpu-60 | us-west1-c | 0.131 | 0.067 | exit 0 | load 69.3 of 60 mean, peak 10.2 GB | replay batch 11 at 66e039d4, 40 workers, 1500 of 1500 games |
| 2026-11-20 17:06 PST | gate-66e039d4-b4 | c3d-highcpu-60 | us-east1-c | 0.169 | 0.087 | exit 0 | load 73.4 of 60 mean, peak 9.0 GB | replay batch 4 at 66e039d4, 40 workers, 5000 of 5000 games |
| 2026-11-20 17:03 PST | gate-66e039d4-b7 | c3d-highcpu-60 | us-central1-a | 0.280 | 0.144 | exit 0 | load 68.7 of 60 mean, peak 11.7 GB | replay batch 7 at 66e039d4, 40 workers, 3000 of 3000 games |
| 2026-11-20 17:01 PST | gate-66e039d4-b8 | c3d-highcpu-60 | us-central1-a | 0.317 | 0.163 | exit 0 | load 68.8 of 60 mean, peak 13.2 GB | replay batch 8 at 66e039d4, 40 workers, 3000 of 3000 games |
| 2026-11-20 17:17 PST | gate-66e039d4-b12 | c3d-highcpu-60 | us-east1-c | 0.130 | 0.067 | exit 0 | load 67.4 of 60 mean, peak 10.4 GB | replay batch 12 at 66e039d4, 40 workers, 1500 of 1500 games |
| 2026-11-20 17:19 PST | gate-66e039d4-b13 | c3d-highcpu-60 | us-west1-c | 0.126 | 0.065 | exit 0 | load 73.1 of 60 mean, peak 10.8 GB | replay batch 13 at 66e039d4, 40 workers, 1500 of 1500 games |
| 2026-11-20 17:20 PST | gate-66e039d4-b14 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 69.4 of 60 mean, peak 10.9 GB | replay batch 14 at 66e039d4, 40 workers, 1500 of 1500 games |
| 2026-11-20 17:21 PST | gate-66e039d4-pilots | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 67.0 of 60 mean, peak 10.9 GB | replay batch pilots at 66e039d4, 40 workers, 1353 of 1353 games |
| 2026-11-20 17:26 PST | gate-66e039d4-b3 | c3d-highcpu-60 | us-east1-c | 0.091 | 0.047 | exit 0 | load 47.4 of 60 mean, peak 7.6 GB | replay batch 3 at 66e039d4, 40 workers, 5000 of 5000 games |
| 2026-11-20 17:28 PST | gate-66e039d4-b1 | c3d-highcpu-60 | us-west1-c | 0.092 | 0.047 | exit 0 | load 49.1 of 60 mean, peak 7.9 GB | replay batch 1 at 66e039d4, 40 workers, 5000 of 5000 games |
| 2026-11-20 17:29 PST | gate-66e039d4-b15 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.048 | exit 0 | load 48.3 of 60 mean, peak 10.1 GB | replay batch 15 at 66e039d4, 40 workers, 618 of 618 games |
| 2026-11-20 17:29 PST | gate-66e039d4-b2 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.049 | exit 0 | load 50.2 of 60 mean, peak 7.2 GB | replay batch 2 at 66e039d4, 40 workers, 5000 of 5000 games |
| 2026-11-20 17:32 PST | gate-66e039d4-b18 | c3d-highcpu-60 | us-east1-c | 0.060 | 0.031 | exit 0 | load 48.6 of 60 mean, peak 9.9 GB | replay batch 18 at 66e039d4, 40 workers, 605 of 605 games |
| 2026-11-20 17:35 PST | gate-66e039d4-b17 | c3d-highcpu-60 | us-central1-a | 0.058 | 0.030 | exit 0 | load 48.2 of 60 mean, peak 10.0 GB | replay batch 17 at 66e039d4, 40 workers, 605 of 605 games |
| 2026-11-20 17:36 PST | gate-66e039d4-b16 | c3d-highcpu-60 | us-east1-c | 0.058 | 0.030 | exit 0 | not sampled | replay batch 16 at 66e039d4, 40 workers, 106 of 106 games |
| 2026-11-20 17:35 PST | gate-66e039d4-b20 | c3d-highcpu-60 | us-central1-a | 0.095 | 0.049 | exit 0 | load 47.1 of 60 mean, peak 9.2 GB | replay batch 20 at 66e039d4, 40 workers, 605 of 605 games |
| 2026-11-20 17:38 PST | gate-66e039d4-b23 | c3d-highcpu-60 | us-west1-c | 0.058 | 0.030 | exit 0 | not sampled | replay batch 23 at 66e039d4, 40 workers, 600 of 600 games |
| 2026-11-20 18:33 PST | gate-445138e7-b8 | c3d-highcpu-60 | us-east1-c | 0.303 | 0.156 | exit 0 | load 67.8 of 60 mean, peak 12.9 GB | replay batch 8 at 445138e7, 40 workers, 3000 of 3000 games |
| 2026-11-20 18:32 PST | gate-445138e7-b5 | c3d-highcpu-60 | us-central1-a | 0.414 | 0.213 | exit 0 | load 67.2 of 60 mean, peak 14.9 GB | replay batch 5 at 445138e7, 40 workers, 3000 of 3000 games |
| 2026-11-20 18:32 PST | gate-445138e7-b10 | c3d-highcpu-60 | us-central1-a | 0.414 | 0.213 | exit 0 | load 65.0 of 60 mean, peak 15.4 GB | replay batch 10 at 445138e7, 40 workers, 3000 of 3000 games |
| 2026-11-20 18:33 PST | gate-445138e7-b6 | c3d-highcpu-60 | us-west1-c | 0.412 | 0.212 | exit 0 | load 68.2 of 60 mean, peak 14.1 GB | replay batch 6 at 445138e7, 40 workers, 3000 of 3000 games |
| 2026-11-20 19:00 PST | gate-445138e7-b11 | c3d-highcpu-60 | us-west1-a | 0.111 | 0.057 | exit 0 | load 66.8 of 60 mean, peak 9.8 GB | replay batch 11 at 445138e7, 40 workers, 1500 of 1500 games |
| 2026-11-20 18:58 PST | gate-445138e7-b4 | c3d-highcpu-60 | us-central1-a | 0.160 | 0.082 | exit 0 | load 72.1 of 60 mean, peak 8.9 GB | replay batch 4 at 445138e7, 40 workers, 5000 of 5000 games |
| 2026-11-20 18:53 PST | gate-445138e7-b9 | c3d-highcpu-60 | us-east1-c | 0.305 | 0.157 | exit 0 | load 68.2 of 60 mean, peak 13.0 GB | replay batch 9 at 445138e7, 40 workers, 3000 of 3000 games |
| 2026-11-20 18:57 PST | gate-445138e7-b7 | c3d-highcpu-60 | us-central1-a | 0.269 | 0.138 | exit 0 | load 68.0 of 60 mean, peak 11.6 GB | replay batch 7 at 445138e7, 40 workers, 3000 of 3000 games |
| 2026-11-20 19:08 PST | gate-445138e7-b12 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 69.5 of 60 mean, peak 10.2 GB | replay batch 12 at 445138e7, 40 workers, 1500 of 1500 games |
| 2026-11-20 19:12 PST | gate-445138e7-b13 | c3d-highcpu-60 | us-east1-b | 0.129 | 0.066 | exit 0 | load 71.6 of 60 mean, peak 10.7 GB | replay batch 13 at 445138e7, 40 workers, 1500 of 1500 games |
| 2026-11-20 19:14 PST | gate-445138e7-b14 | c3d-highcpu-60 | us-central1-b | 0.129 | 0.066 | exit 0 | load 68.7 of 60 mean, peak 10.4 GB | replay batch 14 at 445138e7, 40 workers, 1500 of 1500 games |
| 2026-11-20 19:16 PST | gate-445138e7-pilots | c3d-highcpu-60 | us-west1-a | 0.127 | 0.065 | exit 0 | load 68.3 of 60 mean, peak 10.3 GB | replay batch pilots at 445138e7, 40 workers, 1353 of 1353 games |
| 2026-11-20 19:16 PST | gate-445138e7-b1 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 60.8 of 60 mean, peak 7.2 GB | replay batch 1 at 445138e7, 40 workers, 5000 of 5000 games |
| 2026-11-20 19:21 PST | gate-445138e7-b3 | c3d-highcpu-60 | us-east1-b | 0.089 | 0.046 | exit 0 | load 48.2 of 60 mean, peak 7.9 GB | replay batch 3 at 445138e7, 40 workers, 5000 of 5000 games |
| 2026-11-20 19:24 PST | gate-445138e7-b15 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.5 of 60 mean, peak 9.8 GB | replay batch 15 at 445138e7, 40 workers, 618 of 618 games |
| 2026-11-20 19:22 PST | gate-445138e7-b2 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.066 | exit 0 | load 54.8 of 60 mean, peak 7.3 GB | replay batch 2 at 445138e7, 40 workers, 5000 of 5000 games |
| 2026-11-20 19:27 PST | gate-445138e7-b18 | c3d-highcpu-60 | us-east1-c | 0.061 | 0.031 | exit 0 | load 50.6 of 60 mean, peak 10.2 GB | replay batch 18 at 445138e7, 40 workers, 605 of 605 games |
| 2026-11-20 19:30 PST | gate-445138e7-b17 | c3d-highcpu-60 | us-central1-a | 0.061 | 0.031 | exit 0 | load 48.1 of 60 mean, peak 10.0 GB | replay batch 17 at 445138e7, 40 workers, 605 of 605 games |
| 2026-11-20 19:31 PST | gate-445138e7-b16 | c3d-highcpu-60 | us-central1-a | 0.060 | 0.031 | exit 0 | not sampled | replay batch 16 at 445138e7, 40 workers, 106 of 106 games |
| 2026-11-20 19:32 PST | gate-445138e7-b20 | c3d-highcpu-60 | us-east1-c | 0.098 | 0.050 | exit 0 | load 46.7 of 60 mean, peak 10.4 GB | replay batch 20 at 445138e7, 40 workers, 605 of 605 games |
| 2026-11-20 19:39 PST | gate-445138e7-b23 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.027 | exit 0 | not sampled | replay batch 23 at 445138e7, 40 workers, 600 of 600 games |
| 2026-11-20 20:20 PST | gate-d3f4a5ff-b9 | c3d-highcpu-60 | us-central1-a | 0.299 | 0.154 | exit 0 | load 69.0 of 60 mean, peak 12.9 GB | replay batch 9 at d3f4a5ff, 40 workers, 3000 of 3000 games |
| 2026-11-20 20:20 PST | gate-d3f4a5ff-b6 | c3d-highcpu-60 | us-central1-a | 0.334 | 0.172 | exit 0 | load 68.1 of 60 mean, peak 15.5 GB | replay batch 6 at d3f4a5ff, 40 workers, 3000 of 3000 games |
| 2026-11-20 20:21 PST | gate-d3f4a5ff-b10 | c3d-highcpu-60 | us-east1-c | 0.405 | 0.208 | exit 0 | load 64.9 of 60 mean, peak 14.8 GB | replay batch 10 at d3f4a5ff, 40 workers, 3000 of 3000 games |
| 2026-11-20 20:28 PST | gate-d3f4a5ff-b5 | c3d-highcpu-60 | us-west1-c | 0.404 | 0.208 | exit 0 | load 67.3 of 60 mean, peak 14.0 GB | replay batch 5 at d3f4a5ff, 40 workers, 3000 of 3000 games |
| 2026-11-20 20:46 PST | gate-d3f4a5ff-b4 | c3d-highcpu-60 | us-east1-c | 0.159 | 0.082 | exit 0 | load 75.1 of 60 mean, peak 9.4 GB | replay batch 4 at d3f4a5ff, 40 workers, 5000 of 5000 games |
| 2026-11-20 20:40 PST | gate-d3f4a5ff-b7 | c3d-highcpu-60 | us-central1-a | 0.265 | 0.136 | exit 0 | load 68.5 of 60 mean, peak 11.7 GB | replay batch 7 at d3f4a5ff, 40 workers, 3000 of 3000 games |
| 2026-11-20 20:38 PST | gate-d3f4a5ff-b8 | c3d-highcpu-60 | us-central1-a | 0.299 | 0.154 | exit 0 | load 68.5 of 60 mean, peak 12.9 GB | replay batch 8 at d3f4a5ff, 40 workers, 3000 of 3000 games |
| 2026-11-20 20:56 PST | gate-d3f4a5ff-b13 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 73.6 of 60 mean, peak 11.1 GB | replay batch 13 at d3f4a5ff, 40 workers, 1500 of 1500 games |
| 2026-11-20 20:57 PST | gate-d3f4a5ff-b12 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.064 | exit 0 | load 67.0 of 60 mean, peak 10.5 GB | replay batch 12 at d3f4a5ff, 40 workers, 1500 of 1500 games |
| 2026-11-20 20:57 PST | gate-d3f4a5ff-b14 | c3d-highcpu-60 | us-east1-c | 0.125 | 0.064 | exit 0 | load 68.7 of 60 mean, peak 10.7 GB | replay batch 14 at d3f4a5ff, 40 workers, 1500 of 1500 games |
| 2026-11-20 21:05 PST | gate-d3f4a5ff-b2 | c3d-highcpu-60 | us-central1-a | 0.093 | 0.048 | exit 0 | load 50.2 of 60 mean, peak 7.6 GB | replay batch 2 at d3f4a5ff, 40 workers, 5000 of 5000 games |
| 2026-11-20 21:06 PST | gate-d3f4a5ff-b20 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.046 | exit 0 | load 45.9 of 60 mean, peak 10.1 GB | replay batch 20 at d3f4a5ff, 40 workers, 605 of 605 games |
| 2026-11-20 21:05 PST | gate-d3f4a5ff-pilots | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 71.8 of 60 mean, peak 10.3 GB | replay batch pilots at d3f4a5ff, 40 workers, 1353 of 1353 games |
| 2026-11-20 21:11 PST | gate-d3f4a5ff-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.2 of 60 mean, peak 7.6 GB | replay batch 1 at d3f4a5ff, 40 workers, 5000 of 5000 games |
| 2026-11-20 21:12 PST | gate-d3f4a5ff-b3 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 49.5 of 60 mean, peak 7.7 GB | replay batch 3 at d3f4a5ff, 40 workers, 5000 of 5000 games |
| 2026-11-20 21:13 PST | gate-d3f4a5ff-b15 | c3d-highcpu-60 | us-east1-b | 0.088 | 0.045 | exit 0 | load 46.2 of 60 mean, peak 9.9 GB | replay batch 15 at d3f4a5ff, 40 workers, 618 of 618 games |
| 2026-11-20 21:17 PST | gate-d3f4a5ff-b17 | c3d-highcpu-60 | us-central1-b | 0.089 | 0.046 | exit 0 | load 52.0 of 60 mean, peak 10.9 GB | replay batch 17 at d3f4a5ff, 40 workers, 605 of 605 games |
| 2026-11-20 21:19 PST | gate-d3f4a5ff-b16 | c3d-highcpu-60 | us-east1-b | 0.054 | 0.028 | exit 0 | not sampled | replay batch 16 at d3f4a5ff, 40 workers, 106 of 106 games |
| 2026-11-20 21:18 PST | gate-d3f4a5ff-b18 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 48.5 of 60 mean, peak 9.5 GB | replay batch 18 at d3f4a5ff, 40 workers, 605 of 605 games |
| 2026-11-20 21:23 PST | gate-d3f4a5ff-b23 | c3d-highcpu-60 | us-central1-a | 0.054 | 0.028 | exit 0 | not sampled | replay batch 23 at d3f4a5ff, 40 workers, 600 of 600 games |
| 2026-11-20 21:26 PST | gate-d3f4a5ff-b11 | c3d-highcpu-60 | us-central1-a | 0.129 | 0.066 | exit 0 | load 69.6 of 60 mean, peak 10.4 GB | replay batch 11 at d3f4a5ff, 40 workers, 1500 of 1500 games |
| 2026-11-20 22:01 PST | gate-431cf47d-b9 | c3d-highcpu-60 | us-east1-b | 0.305 | 0.157 | exit 0 | load 67.9 of 60 mean, peak 12.8 GB | replay batch 9 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-20 22:00 PST | gate-431cf47d-b6 | c3d-highcpu-60 | us-central1-a | 0.345 | 0.177 | exit 0 | load 67.6 of 60 mean, peak 14.8 GB | replay batch 6 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-20 22:00 PST | gate-431cf47d-b5 | c3d-highcpu-60 | us-central1-a | 0.380 | 0.195 | exit 0 | load 67.7 of 60 mean, peak 15.0 GB | replay batch 5 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-20 22:09 PST | gate-431cf47d-b10 | c3d-highcpu-60 | us-west1-a | 0.384 | 0.197 | exit 0 | load 64.8 of 60 mean, peak 15.5 GB | replay batch 10 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-20 22:23 PST | gate-431cf47d-b4 | c3d-highcpu-60 | us-central1-a | 0.176 | 0.090 | exit 0 | load 73.4 of 60 mean, peak 9.4 GB | replay batch 4 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-20 22:22 PST | gate-431cf47d-b7 | c3d-highcpu-60 | us-east1-b | 0.238 | 0.122 | exit 0 | load 66.9 of 60 mean, peak 11.7 GB | replay batch 7 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-20 22:20 PST | gate-431cf47d-b8 | c3d-highcpu-60 | us-central1-f | 0.326 | 0.168 | exit 0 | load 66.4 of 60 mean, peak 13.4 GB | replay batch 8 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-20 22:34 PST | gate-431cf47d-b11 | c3d-highcpu-60 | us-west1-c | 0.134 | 0.069 | exit 0 | load 67.5 of 60 mean, peak 9.9 GB | replay batch 11 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-20 22:34 PST | gate-431cf47d-b12 | c3d-highcpu-60 | us-central1-a | 0.138 | 0.071 | exit 0 | load 68.5 of 60 mean, peak 10.0 GB | replay batch 12 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-20 22:37 PST | gate-431cf47d-b13 | c3d-highcpu-60 | us-east1-b | 0.138 | 0.071 | exit 0 | load 72.5 of 60 mean, peak 10.6 GB | replay batch 13 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-20 22:41 PST | gate-431cf47d-b14 | c3d-highcpu-60 | us-central1-a | 0.102 | 0.052 | exit 0 | load 71.0 of 60 mean, peak 8.2 GB | replay batch 14 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-20 22:43 PST | gate-431cf47d-pilots | c3d-highcpu-60 | us-central1-a | 0.096 | 0.049 | exit 0 | load 68.5 of 60 mean, peak 10.4 GB | replay batch pilots at 431cf47d, 40 workers, 1353 of 1353 games |
| 2026-11-20 22:47 PST | gate-431cf47d-b20 | c3d-highcpu-60 | us-east1-b | 0.097 | 0.050 | exit 0 | load 47.8 of 60 mean, peak 10.1 GB | replay batch 20 at 431cf47d, 40 workers, 605 of 605 games |
| 2026-11-20 22:48 PST | gate-431cf47d-b1 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 48.9 of 60 mean, peak 7.6 GB | replay batch 1 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-20 22:49 PST | gate-431cf47d-b3 | c3d-highcpu-60 | us-central1-a | 0.102 | 0.052 | exit 0 | load 48.5 of 60 mean, peak 7.9 GB | replay batch 3 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-20 22:54 PST | gate-431cf47d-b15 | c3d-highcpu-60 | us-central1-c | 0.063 | 0.032 | exit 0 | load 49.0 of 60 mean, peak 10.1 GB | replay batch 15 at 431cf47d, 40 workers, 618 of 618 games |
| 2026-11-20 22:55 PST | gate-431cf47d-b17 | c3d-highcpu-60 | us-east1-b | 0.061 | 0.031 | exit 0 | load 47.6 of 60 mean, peak 10.5 GB | replay batch 17 at 431cf47d, 40 workers, 605 of 605 games |
| 2026-11-20 22:56 PST | gate-431cf47d-b18 | c3d-highcpu-60 | us-central1-a | 0.059 | 0.030 | exit 0 | load 49.7 of 60 mean, peak 9.7 GB | replay batch 18 at 431cf47d, 40 workers, 605 of 605 games |
| 2026-11-20 22:58 PST | gate-431cf47d-b16 | c3d-highcpu-60 | us-central1-a | 0.060 | 0.031 | exit 0 | not sampled | replay batch 16 at 431cf47d, 40 workers, 106 of 106 games |
| 2026-11-20 23:00 PST | gate-431cf47d-b23 | c3d-highcpu-60 | us-central1-c | 0.058 | 0.030 | exit 0 | not sampled | replay batch 23 at 431cf47d, 40 workers, 600 of 600 games |
| 2026-11-20 22:59 PST | gate-431cf47d-b2 | c3d-highcpu-60 | us-east1-b | 0.092 | 0.047 | exit 0 | load 51.7 of 60 mean, peak 7.7 GB | replay batch 2 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-21 02:00 PST | gate-431cf47d-b5 | c3d-highcpu-60 | us-central1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 5 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:00 PST | gate-431cf47d-b10 | c3d-highcpu-60 | us-central1-a | 0.014 | 0.007 | exit 0 | not sampled | replay batch 10 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:01 PST | gate-431cf47d-b6 | c3d-highcpu-60 | us-east1-b | 0.014 | 0.007 | exit 0 | not sampled | replay batch 6 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:01 PST | gate-431cf47d-b9 | c3d-highcpu-60 | us-west1-c | 0.013 | 0.007 | exit 0 | not sampled | replay batch 9 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:01 PST | gate-431cf47d-b8 | c3d-highcpu-60 | us-central1-a | 0.013 | 0.007 | exit 0 | not sampled | replay batch 8 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:02 PST | gate-431cf47d-b7 | c3d-highcpu-60 | us-central1-a | 0.014 | 0.007 | exit 0 | not sampled | replay batch 7 at 431cf47d, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:02 PST | gate-431cf47d-b4 | c3d-highcpu-60 | us-central1-f | 0.015 | 0.008 | exit 0 | not sampled | replay batch 4 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-21 02:02 PST | gate-431cf47d-b11 | c3d-highcpu-60 | us-central1-b | 0.021 | 0.011 | exit 0 | not sampled | replay batch 11 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-21 02:03 PST | gate-431cf47d-b12 | c3d-highcpu-60 | us-central1-f | 0.011 | 0.006 | exit 0 | not sampled | replay batch 12 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-21 02:03 PST | gate-431cf47d-b13 | c3d-highcpu-60 | us-east1-b | 0.019 | 0.010 | exit 0 | not sampled | replay batch 13 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-21 02:04 PST | gate-431cf47d-b14 | c3d-highcpu-60 | us-central1-b | 0.013 | 0.007 | exit 0 | not sampled | replay batch 14 at 431cf47d, 40 workers, 1500 of 1500 games |
| 2026-11-21 02:04 PST | gate-431cf47d-pilots | c3d-highcpu-60 | us-central1-a | 0.018 | 0.009 | exit 0 | not sampled | replay batch pilots at 431cf47d, 40 workers, 1353 of 1353 games |
| 2026-11-21 02:05 PST | gate-431cf47d-b1 | c3d-highcpu-60 | us-central1-f | 0.018 | 0.009 | exit 0 | not sampled | replay batch 1 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-21 02:05 PST | gate-431cf47d-b2 | c3d-highcpu-60 | us-central1-f | 0.018 | 0.009 | exit 0 | not sampled | replay batch 2 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-21 02:05 PST | gate-431cf47d-b20 | c3d-highcpu-60 | us-east1-b | 0.018 | 0.009 | exit 0 | not sampled | replay batch 20 at 431cf47d, 40 workers, 605 of 605 games |
| 2026-11-21 02:06 PST | gate-431cf47d-b3 | c3d-highcpu-60 | us-central1-f | 0.018 | 0.009 | exit 0 | not sampled | replay batch 3 at 431cf47d, 40 workers, 5000 of 5000 games |
| 2026-11-21 02:06 PST | gate-431cf47d-b15 | c3d-highcpu-60 | us-central1-c | 0.018 | 0.009 | exit 0 | not sampled | replay batch 15 at 431cf47d, 40 workers, 618 of 618 games |
| 2026-11-21 02:07 PST | gate-431cf47d-b18 | c3d-highcpu-60 | us-central1-f | 0.018 | 0.009 | exit 0 | not sampled | replay batch 18 at 431cf47d, 40 workers, 605 of 605 games |
| 2026-11-21 02:07 PST | gate-431cf47d-b17 | c3d-highcpu-60 | us-east1-b | 0.017 | 0.009 | exit 0 | not sampled | replay batch 17 at 431cf47d, 40 workers, 605 of 605 games |
| 2026-11-21 02:07 PST | gate-431cf47d-b16 | c3d-highcpu-60 | us-central1-c | 0.017 | 0.009 | exit 0 | not sampled | replay batch 16 at 431cf47d, 40 workers, 106 of 106 games |
| 2026-11-21 02:08 PST | gate-431cf47d-b23 | c3d-highcpu-60 | us-central1-f | 0.018 | 0.009 | exit 0 | not sampled | replay batch 23 at 431cf47d, 40 workers, 600 of 600 games |
| 2026-11-21 02:38 PST | gate-dbfee7f3-b9 | c3d-highcpu-60 | us-central1-a | 0.306 | 0.157 | exit 0 | load 67.9 of 60 mean, peak 13.8 GB | replay batch 9 at dbfee7f3, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:39 PST | gate-dbfee7f3-b6 | c3d-highcpu-60 | us-central1-a | 0.341 | 0.175 | exit 0 | load 67.6 of 60 mean, peak 14.8 GB | replay batch 6 at dbfee7f3, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:39 PST | gate-dbfee7f3-b5 | c3d-highcpu-60 | us-east1-b | 0.376 | 0.193 | exit 0 | load 65.8 of 60 mean, peak 14.6 GB | replay batch 5 at dbfee7f3, 40 workers, 3000 of 3000 games |
| 2026-11-21 02:40 PST | gate-dbfee7f3-b10 | c3d-highcpu-60 | us-west1-c | 0.376 | 0.193 | exit 0 | load 63.9 of 60 mean, peak 14.9 GB | replay batch 10 at dbfee7f3, 40 workers, 3000 of 3000 games |
| 2026-11-21 03:03 PST | gate-dbfee7f3-b11 | c3d-highcpu-60 | us-west1-c | 0.127 | 0.065 | exit 0 | load 67.3 of 60 mean, peak 10.5 GB | replay batch 11 at dbfee7f3, 40 workers, 1500 of 1500 games |
| 2026-11-21 03:03 PST | gate-dbfee7f3-b4 | c3d-highcpu-60 | us-east1-b | 0.161 | 0.083 | exit 0 | load 73.9 of 60 mean, peak 9.1 GB | replay batch 4 at dbfee7f3, 40 workers, 5000 of 5000 games |
| 2026-11-21 02:57 PST | gate-dbfee7f3-b8 | c3d-highcpu-60 | us-central1-a | 0.302 | 0.155 | exit 0 | load 68.9 of 60 mean, peak 12.8 GB | replay batch 8 at dbfee7f3, 40 workers, 3000 of 3000 games |
| 2026-11-21 03:00 PST | gate-dbfee7f3-b7 | c3d-highcpu-60 | us-central1-a | 0.267 | 0.137 | exit 0 | load 67.0 of 60 mean, peak 12.4 GB | replay batch 7 at dbfee7f3, 40 workers, 3000 of 3000 games |
| 2026-11-21 03:12 PST | gate-dbfee7f3-b13 | c3d-highcpu-60 | us-west1-c | 0.125 | 0.064 | exit 0 | load 74.7 of 60 mean, peak 10.9 GB | replay batch 13 at dbfee7f3, 40 workers, 1500 of 1500 games |
| 2026-11-21 03:13 PST | gate-dbfee7f3-b12 | c3d-highcpu-60 | us-east1-b | 0.124 | 0.064 | exit 0 | load 70.1 of 60 mean, peak 10.2 GB | replay batch 12 at dbfee7f3, 40 workers, 1500 of 1500 games |
| 2026-11-21 03:16 PST | gate-dbfee7f3-pilots | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 67.7 of 60 mean, peak 10.5 GB | replay batch pilots at dbfee7f3, 40 workers, 1353 of 1353 games |
| 2026-11-21 03:16 PST | gate-dbfee7f3-b14 | c3d-highcpu-60 | us-central1-a | 0.127 | 0.065 | exit 0 | load 66.9 of 60 mean, peak 10.2 GB | replay batch 14 at dbfee7f3, 40 workers, 1500 of 1500 games |
| 2026-11-21 03:21 PST | gate-dbfee7f3-b1 | c3d-highcpu-60 | us-east1-b | 0.096 | 0.049 | exit 0 | load 46.7 of 60 mean, peak 7.9 GB | replay batch 1 at dbfee7f3, 40 workers, 5000 of 5000 games |
| 2026-11-21 03:22 PST | gate-dbfee7f3-b20 | c3d-highcpu-60 | us-west1-c | 0.094 | 0.048 | exit 0 | load 48.2 of 60 mean, peak 9.7 GB | replay batch 20 at dbfee7f3, 40 workers, 605 of 605 games |
| 2026-11-21 03:25 PST | gate-dbfee7f3-b2 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 51.2 of 60 mean, peak 7.5 GB | replay batch 2 at dbfee7f3, 40 workers, 5000 of 5000 games |
| 2026-11-21 03:25 PST | gate-dbfee7f3-b3 | c3d-highcpu-60 | us-central1-a | 0.097 | 0.050 | exit 0 | load 52.8 of 60 mean, peak 7.0 GB | replay batch 3 at dbfee7f3, 40 workers, 5000 of 5000 games |
| 2026-11-21 03:28 PST | gate-dbfee7f3-b15 | c3d-highcpu-60 | us-east1-b | 0.095 | 0.049 | exit 0 | load 49.6 of 60 mean, peak 9.9 GB | replay batch 15 at dbfee7f3, 40 workers, 618 of 618 games |
| 2026-11-21 03:31 PST | gate-dbfee7f3-b16 | c3d-highcpu-60 | us-central1-a | 0.059 | 0.030 | exit 0 | not sampled | replay batch 16 at dbfee7f3, 40 workers, 106 of 106 games |
| 2026-11-21 03:30 PST | gate-dbfee7f3-b17 | c3d-highcpu-60 | us-west1-c | 0.096 | 0.049 | exit 0 | load 47.8 of 60 mean, peak 10.4 GB | replay batch 17 at dbfee7f3, 40 workers, 605 of 605 games |
| 2026-11-21 03:31 PST | gate-dbfee7f3-b18 | c3d-highcpu-60 | us-central1-a | 0.094 | 0.048 | exit 0 | load 47.2 of 60 mean, peak 9.4 GB | replay batch 18 at dbfee7f3, 40 workers, 605 of 605 games |
| 2026-11-21 03:35 PST | gate-dbfee7f3-b23 | c3d-highcpu-60 | us-central1-a | 0.056 | 0.029 | exit 0 | not sampled | replay batch 23 at dbfee7f3, 40 workers, 600 of 600 games |
| 2026-11-21 07:14 PST | gate-9da2968d-b9 | c3d-highcpu-60 | us-east1-c | 0.302 | 0.155 | exit 0 | load 67.1 of 60 mean, peak 14.1 GB | replay batch 9 at 9da2968d, 40 workers, 3000 of 3000 games |
| 2026-11-21 07:13 PST | gate-9da2968d-b10 | c3d-highcpu-60 | us-central1-a | 0.373 | 0.192 | exit 0 | load 64.3 of 60 mean, peak 15.1 GB | replay batch 10 at 9da2968d, 40 workers, 3000 of 3000 games |
| 2026-11-21 07:14 PST | gate-9da2968d-b6 | c3d-highcpu-60 | us-west1-c | 0.372 | 0.191 | exit 0 | load 66.8 of 60 mean, peak 14.2 GB | replay batch 6 at 9da2968d, 40 workers, 3000 of 3000 games |
| 2026-11-21 07:13 PST | gate-9da2968d-b5 | c3d-highcpu-60 | us-central1-a | 0.408 | 0.210 | exit 0 | load 68.0 of 60 mean, peak 13.8 GB | replay batch 5 at 9da2968d, 40 workers, 3000 of 3000 games |
| 2026-11-21 07:38 PST | gate-9da2968d-b11 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 67.2 of 60 mean, peak 9.9 GB | replay batch 11 at 9da2968d, 40 workers, 1500 of 1500 games |
| 2026-11-21 07:38 PST | gate-9da2968d-b4 | c3d-highcpu-60 | us-west1-c | 0.160 | 0.082 | exit 0 | load 75.0 of 60 mean, peak 8.3 GB | replay batch 4 at 9da2968d, 40 workers, 5000 of 5000 games |
| 2026-11-21 07:33 PST | gate-9da2968d-b8 | c3d-highcpu-60 | us-east1-c | 0.302 | 0.155 | exit 0 | load 69.4 of 60 mean, peak 12.5 GB | replay batch 8 at 9da2968d, 40 workers, 3000 of 3000 games |
| 2026-11-21 07:36 PST | gate-9da2968d-b7 | c3d-highcpu-60 | us-central1-a | 0.267 | 0.137 | exit 0 | load 67.9 of 60 mean, peak 11.7 GB | replay batch 7 at 9da2968d, 40 workers, 3000 of 3000 games |
| 2026-11-21 07:46 PST | gate-9da2968d-b13 | c3d-highcpu-60 | us-central1-a | 0.126 | 0.065 | exit 0 | load 71.3 of 60 mean, peak 10.7 GB | replay batch 13 at 9da2968d, 40 workers, 1500 of 1500 games |
| 2026-11-21 07:49 PST | gate-9da2968d-b12 | c3d-highcpu-60 | us-west1-c | 0.124 | 0.064 | exit 0 | load 69.7 of 60 mean, peak 9.2 GB | replay batch 12 at 9da2968d, 40 workers, 1500 of 1500 games |
| 2026-11-21 07:54 PST | gate-9da2968d-b3 | c3d-highcpu-60 | us-central1-a | 0.090 | 0.046 | exit 0 | load 50.2 of 60 mean, peak 7.7 GB | replay batch 3 at 9da2968d, 40 workers, 5000 of 5000 games |
| 2026-11-21 07:52 PST | gate-9da2968d-b14 | c3d-highcpu-60 | us-central1-b | 0.124 | 0.064 | exit 0 | load 66.5 of 60 mean, peak 10.3 GB | replay batch 14 at 9da2968d, 40 workers, 1500 of 1500 games |
| 2026-11-21 07:53 PST | gate-9da2968d-pilots | c3d-highcpu-60 | us-east1-c | 0.126 | 0.065 | exit 0 | load 70.3 of 60 mean, peak 10.3 GB | replay batch pilots at 9da2968d, 40 workers, 1353 of 1353 games |
| 2026-11-21 07:58 PST | gate-9da2968d-b1 | c3d-highcpu-60 | us-west1-c | 0.125 | 0.064 | exit 0 | load 56.2 of 60 mean, peak 7.6 GB | replay batch 1 at 9da2968d, 40 workers, 5000 of 5000 games |
| 2026-11-21 08:01 PST | gate-9da2968d-b20 | c3d-highcpu-60 | us-central1-a | 0.092 | 0.047 | exit 0 | load 46.1 of 60 mean, peak 9.8 GB | replay batch 20 at 9da2968d, 40 workers, 605 of 605 games |
| 2026-11-21 08:02 PST | gate-9da2968d-b17 | c3d-highcpu-60 | us-east1-c | 0.091 | 0.047 | exit 0 | load 49.6 of 60 mean, peak 9.8 GB | replay batch 17 at 9da2968d, 40 workers, 605 of 605 games |
| 2026-11-21 08:01 PST | gate-9da2968d-b2 | c3d-highcpu-60 | us-central1-a | 0.128 | 0.066 | exit 0 | load 53.1 of 60 mean, peak 7.3 GB | replay batch 2 at 9da2968d, 40 workers, 5000 of 5000 games |
| 2026-11-21 08:06 PST | gate-9da2968d-b18 | c3d-highcpu-60 | us-central1-b | 0.055 | 0.028 | exit 0 | load 45.3 of 60 mean, peak 10.1 GB | replay batch 18 at 9da2968d, 40 workers, 605 of 605 games |
| 2026-11-21 08:09 PST | gate-9da2968d-b16 | c3d-highcpu-60 | us-west1-c | 0.055 | 0.028 | exit 0 | not sampled | replay batch 16 at 9da2968d, 40 workers, 106 of 106 games |
| 2026-11-21 08:09 PST | gate-9da2968d-b23 | c3d-highcpu-60 | us-central1-a | 0.057 | 0.029 | exit 0 | not sampled | replay batch 23 at 9da2968d, 40 workers, 600 of 600 games |
| 2026-11-21 08:08 PST | gate-9da2968d-b15 | c3d-highcpu-60 | us-east1-c | 0.091 | 0.047 | exit 0 | load 46.4 of 60 mean, peak 10.2 GB | replay batch 15 at 9da2968d, 40 workers, 618 of 618 games |
| 2026-11-21 09:34 PST | gate-17052df9-b9 | c3d-highcpu-60 | us-east1-c | 0.309 | 0.159 | exit 0 | load 68.4 of 60 mean, peak 13.7 GB | replay batch 9 at 17052df9, 40 workers, 3000 of 3000 games |
| 2026-11-21 09:33 PST | gate-17052df9-b6 | c3d-highcpu-60 | us-central1-a | 0.383 | 0.197 | exit 0 | load 68.4 of 60 mean, peak 14.7 GB | replay batch 6 at 17052df9, 40 workers, 3000 of 3000 games |
| 2026-11-21 09:33 PST | gate-17052df9-b5 | c3d-highcpu-60 | us-central1-a | 0.419 | 0.215 | exit 0 | load 68.0 of 60 mean, peak 13.8 GB | replay batch 5 at 17052df9, 40 workers, 3000 of 3000 games |
| 2026-11-21 09:34 PST | gate-17052df9-b10 | c3d-highcpu-60 | us-west1-c | 0.417 | 0.214 | exit 0 | load 65.0 of 60 mean, peak 15.5 GB | replay batch 10 at 17052df9, 40 workers, 3000 of 3000 games |
| 2026-11-21 09:59 PST | gate-17052df9-b4 | c3d-highcpu-60 | us-central1-a | 0.160 | 0.082 | exit 0 | load 74.3 of 60 mean, peak 8.6 GB | replay batch 4 at 17052df9, 40 workers, 5000 of 5000 games |
| 2026-11-21 10:02 PST | gate-17052df9-b11 | c3d-highcpu-60 | us-west1-c | 0.125 | 0.064 | exit 0 | load 67.7 of 60 mean, peak 10.0 GB | replay batch 11 at 17052df9, 40 workers, 1500 of 1500 games |
| 2026-11-21 09:56 PST | gate-17052df9-b7 | c3d-highcpu-60 | us-central1-a | 0.266 | 0.137 | exit 0 | load 68.2 of 60 mean, peak 11.9 GB | replay batch 7 at 17052df9, 40 workers, 3000 of 3000 games |
| 2026-11-21 10:09 PST | gate-17052df9-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 70.9 of 60 mean, peak 10.3 GB | replay batch 13 at 17052df9, 40 workers, 1500 of 1500 games |
| 2026-11-21 10:10 PST | gate-17052df9-pilots | c3d-highcpu-60 | us-west1-a | 0.124 | 0.064 | exit 0 | load 66.9 of 60 mean, peak 10.5 GB | replay batch pilots at 17052df9, 40 workers, 1353 of 1353 games |
| 2026-11-21 09:54 PST | gate-17052df9-b8 | c3d-highcpu-60 | us-east1-b | 0.412 | 0.212 | exit 0 | load 65.2 of 60 mean, peak 12.6 GB | replay batch 8 at 17052df9, 40 workers, 3000 of 3000 games |
| 2026-11-21 10:13 PST | gate-17052df9-b12 | c3d-highcpu-60 | us-central1-a | 0.125 | 0.064 | exit 0 | load 67.9 of 60 mean, peak 10.1 GB | replay batch 12 at 17052df9, 40 workers, 1500 of 1500 games |
| 2026-11-21 10:19 PST | gate-17052df9-b1 | c3d-highcpu-60 | us-east1-c | 0.090 | 0.046 | exit 0 | load 50.9 of 60 mean, peak 7.8 GB | replay batch 1 at 17052df9, 40 workers, 5000 of 5000 games |
| 2026-11-21 10:17 PST | gate-17052df9-b14 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 66.6 of 60 mean, peak 11.1 GB | replay batch 14 at 17052df9, 40 workers, 1500 of 1500 games |
| 2026-11-21 10:20 PST | gate-17052df9-b2 | c3d-highcpu-60 | us-west1-c | 0.089 | 0.046 | exit 0 | load 52.9 of 60 mean, peak 7.9 GB | replay batch 2 at 17052df9, 40 workers, 5000 of 5000 games |
| 2026-11-21 10:21 PST | gate-17052df9-b3 | c3d-highcpu-60 | us-central1-a | 0.091 | 0.047 | exit 0 | load 51.1 of 60 mean, peak 7.7 GB | replay batch 3 at 17052df9, 40 workers, 5000 of 5000 games |
| 2026-11-21 10:24 PST | gate-17052df9-b20 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 50.1 of 60 mean, peak 10.4 GB | replay batch 20 at 17052df9, 40 workers, 605 of 605 games |
| 2026-11-21 10:27 PST | gate-17052df9-b16 | c3d-highcpu-60 | us-central1-a | 0.055 | 0.028 | exit 0 | not sampled | replay batch 16 at 17052df9, 40 workers, 106 of 106 games |
| 2026-11-21 10:25 PST | gate-17052df9-b15 | c3d-highcpu-60 | us-east1-c | 0.089 | 0.046 | exit 0 | load 46.9 of 60 mean, peak 10.6 GB | replay batch 15 at 17052df9, 40 workers, 618 of 618 games |
| 2026-11-21 10:26 PST | gate-17052df9-b17 | c3d-highcpu-60 | us-west1-c | 0.110 | 0.057 | exit 0 | load 46.1 of 60 mean, peak 9.9 GB | replay batch 17 at 17052df9, 40 workers, 605 of 605 games |
| 2026-11-21 10:30 PST | gate-17052df9-b18 | c3d-highcpu-60 | us-central1-a | 0.057 | 0.029 | exit 0 | load 49.9 of 60 mean, peak 10.0 GB | replay batch 18 at 17052df9, 40 workers, 605 of 605 games |
| 2026-11-21 10:33 PST | gate-17052df9-b23 | c3d-highcpu-60 | us-central1-a | 0.053 | 0.027 | exit 0 | not sampled | replay batch 23 at 17052df9, 40 workers, 600 of 600 games |
| 2026-11-21 14:10 PST | gate-b45c4b3f-b9 | c3d-highcpu-60 | us-west1-c | 0.334 | 0.172 | exit 0 | load 67.8 of 60 mean, peak 13.6 GB | replay batch 9 at b45c4b3f, 40 workers, 3000 of 3000 games |
| 2026-11-21 14:09 PST | gate-b45c4b3f-b6 | c3d-highcpu-60 | us-central1-a | 0.370 | 0.190 | exit 0 | load 67.7 of 60 mean, peak 14.5 GB | replay batch 6 at b45c4b3f, 40 workers, 3000 of 3000 games |
| 2026-11-21 14:09 PST | gate-b45c4b3f-b5 | c3d-highcpu-60 | us-central1-a | 0.404 | 0.208 | exit 0 | load 67.3 of 60 mean, peak 14.0 GB | replay batch 5 at b45c4b3f, 40 workers, 3000 of 3000 games |
| 2026-11-21 14:10 PST | gate-b45c4b3f-b10 | c3d-highcpu-60 | us-east1-c | 0.406 | 0.209 | exit 0 | load 64.6 of 60 mean, peak 15.2 GB | replay batch 10 at b45c4b3f, 40 workers, 3000 of 3000 games |
| 2026-11-21 14:35 PST | gate-b45c4b3f-b11 | c3d-highcpu-60 | us-east1-c | 0.124 | 0.064 | exit 0 | load 70.7 of 60 mean, peak 9.7 GB | replay batch 11 at b45c4b3f, 40 workers, 1500 of 1500 games |
| 2026-11-21 14:34 PST | gate-b45c4b3f-b4 | c3d-highcpu-60 | us-central1-a | 0.160 | 0.082 | exit 0 | load 74.3 of 60 mean, peak 9.2 GB | replay batch 4 at b45c4b3f, 40 workers, 5000 of 5000 games |
| 2026-11-21 14:32 PST | gate-b45c4b3f-b7 | c3d-highcpu-60 | us-central1-a | 0.265 | 0.136 | exit 0 | load 67.8 of 60 mean, peak 11.7 GB | replay batch 7 at b45c4b3f, 40 workers, 3000 of 3000 games |
| 2026-11-21 14:31 PST | gate-b45c4b3f-b8 | c3d-highcpu-60 | us-west1-c | 0.299 | 0.154 | exit 0 | load 68.0 of 60 mean, peak 12.6 GB | replay batch 8 at b45c4b3f, 40 workers, 3000 of 3000 games |
| 2026-11-21 14:43 PST | gate-b45c4b3f-b12 | c3d-highcpu-60 | us-east1-c | 0.124 | 0.064 | exit 0 | load 73.8 of 60 mean, peak 10.6 GB | replay batch 12 at b45c4b3f, 40 workers, 1500 of 1500 games |
| 2026-11-21 14:44 PST | gate-b45c4b3f-b13 | c3d-highcpu-60 | us-central1-a | 0.124 | 0.064 | exit 0 | load 72.7 of 60 mean, peak 11.2 GB | replay batch 13 at b45c4b3f, 40 workers, 1500 of 1500 games |
| 2026-11-21 14:48 PST | gate-b45c4b3f-b14 | c3d-highcpu-60 | us-central1-a | 0.123 | 0.063 | exit 0 | load 69.1 of 60 mean, peak 10.5 GB | replay batch 14 at b45c4b3f, 40 workers, 1500 of 1500 games |
| 2026-11-21 14:52 PST | gate-b45c4b3f-b17 | c3d-highcpu-60 | us-east1-c | 0.087 | 0.045 | exit 0 | load 47.3 of 60 mean, peak 10.2 GB | replay batch 17 at b45c4b3f, 40 workers, 605 of 605 games |
| 2026-11-21 14:52 PST | gate-b45c4b3f-b3 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 51.5 of 60 mean, peak 7.8 GB | replay batch 3 at b45c4b3f, 40 workers, 5000 of 5000 games |
| 2026-11-21 14:51 PST | gate-b45c4b3f-pilots | c3d-highcpu-60 | us-west1-c | 0.123 | 0.063 | exit 0 | load 66.9 of 60 mean, peak 9.9 GB | replay batch pilots at b45c4b3f, 40 workers, 1353 of 1353 games |
| 2026-11-21 14:56 PST | gate-b45c4b3f-b1 | c3d-highcpu-60 | us-central1-a | 0.089 | 0.046 | exit 0 | load 49.6 of 60 mean, peak 7.7 GB | replay batch 1 at b45c4b3f, 40 workers, 5000 of 5000 games |
| 2026-11-21 14:58 PST | gate-b45c4b3f-b2 | c3d-highcpu-60 | us-central1-c | 0.090 | 0.046 | exit 0 | load 52.1 of 60 mean, peak 7.2 GB | replay batch 2 at b45c4b3f, 40 workers, 5000 of 5000 games |
| 2026-11-21 14:59 PST | gate-b45c4b3f-b15 | c3d-highcpu-60 | us-east1-c | 0.088 | 0.045 | exit 0 | load 47.2 of 60 mean, peak 10.0 GB | replay batch 15 at b45c4b3f, 40 workers, 618 of 618 games |
| 2026-11-21 14:59 PST | gate-b45c4b3f-b20 | c3d-highcpu-60 | us-west1-c | 0.089 | 0.046 | exit 0 | load 44.4 of 60 mean, peak 9.8 GB | replay batch 20 at b45c4b3f, 40 workers, 605 of 605 games |
| 2026-11-21 15:02 PST | gate-b45c4b3f-b18 | c3d-highcpu-60 | us-central1-a | 0.088 | 0.045 | exit 0 | load 47.1 of 60 mean, peak 9.5 GB | replay batch 18 at b45c4b3f, 40 workers, 605 of 605 games |
| 2026-11-21 15:04 PST | gate-b45c4b3f-b16 | c3d-highcpu-60 | us-central1-a | 0.060 | 0.031 | exit 0 | not sampled | replay batch 16 at b45c4b3f, 40 workers, 106 of 106 games |
| 2026-11-21 15:05 PST | gate-b45c4b3f-b23 | c3d-highcpu-60 | us-east1-c | 0.054 | 0.028 | exit 0 | not sampled | replay batch 23 at b45c4b3f, 40 workers, 600 of 600 games |
