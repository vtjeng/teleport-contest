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
  peak memory under a quarter of the machine's means the next job of that kind
  goes on a smaller or leaner machine, or runs more workers.
- Times are Pacific.

| Start | Job | Machine | Zone | Hours | Est. $ | Status | Use | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 03:16 PST | b5-bbc273b6 | c3d-highcpu-60 | us-east1-c | under 0.04 | under 0.02 | stopped by hand | not sampled | replay batch 5 at bbc273b6, 40 workers, 0 of 3000 games. Row written by hand at 03:21 PST: I stopped the launcher within about a minute of this VM’s creation, and the stop cut the clean-up short after the delete. The VM was gone at 03:17:31 PST; the bound counts from the launch at 03:15 PST. Fixed in the launcher the same hour. |
