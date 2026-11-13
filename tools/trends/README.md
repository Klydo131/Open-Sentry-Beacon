# Trends, in counts only

A small Python program for whoever looks after a church's copy of Hope Beacon.
It answers questions like "are more pairs talking this month than last?" and
"how many prayer requests a week?", from numbers that cannot name anybody.

It runs **on your own computer**, not in the app: Supabase cannot run Python
inside the database or in its functions, and the counts never need to leave
the person who asked for them.

## What it can read, and what it cannot

It signs in as one database role, `beacon_trends`, which can read exactly one
thing: the view `trends.weekly`
(`supabase/migrations/20261027160000_trends_in_counts_only.sql`). That view has
a church, a week and ten numbers. It has no names, no messages and no ids of
people.

**Any number from 1 to 4 is hidden** and shows as "fewer than 5". In a church of
sixty people, "2 Explorers stopped coming" can point at two known children, so
small numbers never leave the database. 0 is shown, because "nothing happened"
names nobody.

`supabase/tests/trends-are-counts-only.sql` proves all of this with invented
people on every fresh install. The role reads the view and no table. Small
numbers are hidden. A member signed in to the app cannot read the trends. The
role cannot sign in until you give it a password.

The numbers, each counted per week (Monday to Sunday, UTC):

| Column | Counts |
|---|---|
| `people_joined` | people approved into the church |
| `pairs_started` | Guide and Explorer pairs made |
| `pairs_talking` | pairs that sent at least one message |
| `messages` | messages sent (not taken back) |
| `lessons_finished` | lessons marked finished in a pair |
| `lessons_read` | lessons read |
| `prayer_requests` | prayer requests made |
| `meetings` | meetings planned for that week |
| `reports_raised`, `reports_closed` | reports to Admin Reports |

## Set it up once

1. **Give the role a password.** In Supabase, open **SQL Editor** and run, with
   a long password from your password manager:

   ```sql
   alter role beacon_trends with login password 'a long password from your password manager';
   ```

   To switch it off again: `alter role beacon_trends nologin;`

2. **Find the connection string.** In Supabase, press **Connect**, choose
   **Session pooler**, and copy the string. Change the user name from
   `postgres.<your-project>` to `beacon_trends.<your-project>`, and put your
   password where it says `[YOUR-PASSWORD]`.

   On the Postgres edition, it is your server's own address:
   `postgresql://beacon_trends:<password>@<your-server>:5432/postgres`.

3. **Keep that string on your computer.** Put it in an environment variable
   (below). Never put it in a file in this repository, a chat or an e-mail.
   With it, anybody can read your church's trends.

4. **Install Python 3.10 or newer, then the two libraries:**

   ```sh
   cd tools/trends
   pip install -r requirements.txt
   ```

## Run it

```sh
export TRENDS_DATABASE_URL='postgresql://beacon_trends.<your-project>:<password>@<pooler-host>:5432/postgres'
python trends.py                 # the last 52 weeks
python trends.py --weeks 13      # the last quarter
python trends.py --demo          # invented numbers, no database, to try it first
```

On Windows PowerShell, set the variable with
`$env:TRENDS_DATABASE_URL = '...'`.

It writes into `trends-out/`, which git ignores:

- `weekly.csv` has every week and every number, with "fewer than 5" where a
  number is hidden. It opens in Excel or Google Sheets.
- `summary.txt` compares the last four weeks with the four before, for each
  number. It also says whether each number is rising, falling or steady over
  the last twelve weeks. A total that includes a hidden week is given as a
  range ("between 11 and 14"). The trend describes the past; it is not a
  forecast.
- `charts/` holds one picture per church and number. A hidden week is drawn as
  a hatched band from 1 to 4.

The output is your church's own information. Keep it where you would keep
the church's other records.

## For developers

- `python -m unittest discover -s tools/trends` runs its checks. They need
  nothing installed.
- A new number belongs in the view first, with the same "1 to 4 is hidden"
  rule, then in `MEASURES` here. The SQL test lists the view's columns, so it
  will fail until you add the new one there too.
