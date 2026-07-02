-- fixshitbroken — initial schema (Phase 0)
-- Implements TECHNICAL_PLAN.md section 5. Designed so adding state/local later
-- is a data change, not a rewrite: jurisdiction/chamber are real dimensions.
--
-- Convention: reference/ingested tables are written ONLY by the ingestion
-- worker (service role). Editorial, user, polling, and community tables are
-- written by the app under row-level security. RLS policies are added in a
-- later migration (Phase 3, when auth lands); this migration is structure only.

begin;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type chamber_type      as enum ('house', 'senate');
create type party_type        as enum ('D', 'R', 'I');
create type vote_position     as enum ('yes', 'no', 'present', 'not_voting');
create type vote_source       as enum ('house_api', 'senate_xml');
create type lobby_stance      as enum ('support', 'oppose');
create type verification_kind as enum ('email', 'phone', 'district');
create type poll_position     as enum ('yes', 'no');
create type content_status    as enum ('visible', 'under_review', 'removed');

-- ===========================================================================
-- REFERENCE / INGESTED  (read-only to the app; written by the worker)
-- ===========================================================================

-- A legislator is keyed on their Bioguide ID — the stable cross-source key.
create table legislator (
  bioguide_id     text primary key,
  full_name       text not null,
  party           party_type,
  photo_url       text,
  current_chamber chamber_type,
  state           text,                       -- 2-letter postal
  district        smallint,                   -- null for senators
  in_office       boolean not null default true,
  jurisdiction    text not null default 'federal',
  socials         jsonb not null default '{}'::jsonb,
  contact         jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);
create index legislator_state_idx   on legislator (state);
create index legislator_chamber_idx on legislator (current_chamber);
create index legislator_in_office_idx on legislator (in_office);

-- Historical + current terms support "career" views.
create table term (
  id            bigint generated always as identity primary key,
  bioguide_id   text not null references legislator (bioguide_id) on delete cascade,
  chamber       chamber_type not null,
  state         text not null,
  district      smallint,
  party         party_type,
  start_date    date not null,
  end_date      date,
  jurisdiction  text not null default 'federal',
  unique (bioguide_id, start_date, chamber)
);
create index term_bioguide_idx on term (bioguide_id);

create table legislation (
  id               bigint generated always as identity primary key,
  congress_gov_id  text unique,               -- stable Congress.gov identifier
  congress         smallint not null,
  bill_type        text not null,             -- hr, s, hjres, ...
  number           integer not null,
  title            text,
  status           text,
  introduced_date  date,
  sponsor_id       text references legislator (bioguide_id),
  summary_official text,
  updated_at       timestamptz not null default now(),
  unique (congress, bill_type, number)
);
create index legislation_sponsor_idx    on legislation (sponsor_id);
create index legislation_introduced_idx on legislation (introduced_date desc);

create table legislation_cosponsor (
  legislation_id bigint not null references legislation (id) on delete cascade,
  bioguide_id    text   not null references legislator (bioguide_id),
  cosponsored_on date,
  primary key (legislation_id, bioguide_id)
);

create table roll_call_vote (
  id             bigint generated always as identity primary key,
  source         vote_source not null,
  congress       smallint not null,
  session        smallint not null,
  roll_number    integer not null,
  chamber        chamber_type not null,
  vote_date      timestamptz,
  question       text,
  legislation_id bigint references legislation (id),
  result         text,
  unique (source, congress, session, roll_number, chamber)
);
create index roll_call_legislation_idx on roll_call_vote (legislation_id);
create index roll_call_date_idx on roll_call_vote (vote_date desc);

-- One row per member per vote. The normalization target both House API and
-- Senate XML map into.
create table member_vote (
  roll_call_vote_id bigint not null references roll_call_vote (id) on delete cascade,
  bioguide_id       text   not null references legislator (bioguide_id),
  position          vote_position not null,
  primary key (roll_call_vote_id, bioguide_id)
);
create index member_vote_member_idx on member_vote (bioguide_id);

-- ===========================================================================
-- EDITORIAL  (written by humans / the pipeline; provenance matters)
-- ===========================================================================

create table legislation_summary (
  legislation_id bigint primary key references legislation (id) on delete cascade,
  plain_summary  text,                         -- the 30-second read
  what_it_does   jsonb not null default '[]'::jsonb,  -- bullet array
  winners        text,
  losers         text,
  who_pays       text,
  status         content_status not null default 'visible',
  author         text,
  reviewed_by    text,
  published_at   timestamptz
);

create table lobbying_position (
  id             bigint generated always as identity primary key,
  legislation_id bigint not null references legislation (id) on delete cascade,
  org            text not null,
  -- NOTE: stance is nullable on purpose. Disclosure filings say WHO lobbied on a
  -- bill, never which side. Stance is filled in later, editorially, with a
  -- source_url — never inferred from the filing. v1 ships stance = null.
  stance         lobby_stance,
  source_url     text
);

-- ===========================================================================
-- USERS & VERIFICATION  (the integrity core)
-- ===========================================================================
-- Mirrors Supabase auth.users via id; auth itself lives in the auth schema.

create table app_user (
  id                uuid primary key,          -- = auth.users.id
  email             text,
  email_verified_at timestamptz,
  phone             text,
  phone_verified_at timestamptz,
  home_state        text,
  home_district     smallint,                  -- null until district-verified
  display_name      text,
  created_at        timestamptz not null default now()
);

create table verification_event (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references app_user (id) on delete cascade,
  kind         verification_kind not null,
  method       text,
  evidence_ref text,
  verified_at  timestamptz not null default now()
);
create index verification_user_idx on verification_event (user_id);

create table watchlist_item (
  user_id     uuid not null references app_user (id) on delete cascade,
  target_type text not null,                   -- 'legislation' | 'legislator'
  target_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create table notification_pref (
  user_id     uuid not null references app_user (id) on delete cascade,
  channel     text not null,                   -- 'email' | 'sms'
  event_types jsonb not null default '[]'::jsonb,
  primary key (user_id, channel)
);

-- ===========================================================================
-- POLLING  (feeds The Pulse; NEVER presented as a headline grade)
-- ===========================================================================

create table poll (
  id             bigint generated always as identity primary key,
  legislation_id bigint references legislation (id),
  roll_call_vote_id bigint references roll_call_vote (id),
  question       text not null,
  opens_at       timestamptz not null default now(),
  closes_at      timestamptz,
  check (legislation_id is not null or roll_call_vote_id is not null)
);

create table poll_response (
  poll_id       bigint not null references poll (id) on delete cascade,
  user_id       uuid   not null references app_user (id) on delete cascade,
  position      poll_position not null,
  -- Snapshotted at vote time so a later move does not silently re-attribute.
  user_state    text,
  user_district smallint,
  created_at    timestamptz not null default now(),
  primary key (poll_id, user_id)               -- one verified person, one vote
);
create index poll_response_poll_idx on poll_response (poll_id);

-- Derived; recomputed, never authored. respondent_n is always surfaced in UI.
create table alignment_score (
  bioguide_id  text not null references legislator (bioguide_id) on delete cascade,
  window_label text not null,                  -- e.g. '118th' | 'last_90d'
  score        numeric(5,2),
  respondent_n integer not null default 0,
  confidence   numeric(5,2),
  computed_at  timestamptz not null default now(),
  primary key (bioguide_id, window_label)
);

-- ===========================================================================
-- COMMUNITY  (Town Hall — highest moderation risk)
-- ===========================================================================

create table board (
  bioguide_id      text primary key references legislator (bioguide_id) on delete cascade,
  activity_metrics jsonb not null default '{}'::jsonb
);

create table post (
  id            bigint generated always as identity primary key,
  bioguide_id   text not null references board (bioguide_id) on delete cascade,
  user_id       uuid not null references app_user (id) on delete cascade,
  body          text not null,
  is_local      boolean not null default false,  -- verified-constituent badge
  score         integer not null default 0,
  status        content_status not null default 'visible',
  permalink_slug text not null unique,            -- the permanent indexed URL
  created_at    timestamptz not null default now()
);
create index post_board_idx on post (bioguide_id);
-- Removed posts render a tombstone, not a 404, honoring "permanence" (section 6).

create table post_vote (
  post_id bigint not null references post (id) on delete cascade,
  user_id uuid   not null references app_user (id) on delete cascade,
  value   smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

create table meme (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references app_user (id) on delete cascade,
  image_ref  text not null,
  caption    text,
  status     content_status not null default 'visible',
  week       date not null,
  created_at timestamptz not null default now()
);

create table meme_vote (
  meme_id bigint not null references meme (id) on delete cascade,
  user_id uuid   not null references app_user (id) on delete cascade,
  primary key (meme_id, user_id)
);

create table hall_of_fame (
  week     date primary key,
  meme_ids bigint[] not null default '{}'      -- top 3, computed Mondays 09:00 ET
);

create table moderation_action (
  id          bigint generated always as identity primary key,
  target_type text not null,                   -- 'post' | 'meme'
  target_id   bigint not null,
  actor       text not null,
  action      text not null,                   -- 'remove' | 'restore' | 'review'
  reason      text,
  created_at  timestamptz not null default now()
);

commit;
