# Real singing, for testing the tuner

`tests/the-tuner-hears-the-note-sung.mjs` measures the Music room's tuner on
this: 33 seconds of one person singing, with the pitch of every moment and every
note marked by trained musicians. Made-up voices prove the hard cases; this
proves the tuner on a real voice.

| File | What it is |
|---|---|
| `vocadito_1.wav.gz` | The singing: 44,100 samples a second, mono, 16-bit, gzipped. Singer S1, in Tagalog. |
| `vocadito_1_f0.csv.gz` | The pitch every 5.8 ms (seconds, Hz; 0 where there is no voice), gzipped. |
| `vocadito_1_notesA1.csv`, `vocadito_1_notesA2.csv` | The notes, marked separately by two annotators (start, pitch in Hz, length). |

## Where it comes from, and the terms

From **vocadito**, a dataset of solo singing with pitch, note and lyric
annotations:

> Rachel M. Bittner, Katherine Pasalo, Juan José Bosch, Gabriel Meseguer-Brocal
> and David Rubinstein. *vocadito: A dataset of solo vocals with f0, note, and
> lyric annotations.* Spotify technical report, 2021.
> <https://arxiv.org/abs/2110.05580>

Licensed under the **Creative Commons Attribution 4.0 International** licence
(<https://creativecommons.org/licenses/by/4.0/>). The full dataset is at
<https://zenodo.org/record/5578807>.

These files were taken, unchanged except for gzip (and the two note files'
line endings, made plain), from the copy in the
mirdata project's test resources
(<https://github.com/mir-dataset-loaders/mirdata>, commit
`11e11d50d66d25d1afb520b8d13dd371af44d67a`,
`tests/resources/mir_datasets/vocadito/`), on 14 October 2026, because Zenodo
was not reachable from where the tuner was being tested. The uncompressed files'
SHA-256:

```
b509768315efad8120183b48e01d6090f1649d5bcc691241940dc7a100274ab8  vocadito_1.wav
dd10beba57b94d37b1d3263f5deca3b780adc7ec90f1d43bb00099b02c2878e5  vocadito_1_f0.csv
```

They are used only by the test. Nothing here is part of the app, and nothing
about this singer is anywhere else in the repository.
