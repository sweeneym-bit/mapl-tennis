-- Run this in your Supabase SQL editor to set up the database

create table if not exists tournament_state (
  id integer primary key,
  state jsonb not null default '{}',
  updated_at timestamp with time zone default now()
);

-- Insert the initial empty row
insert into tournament_state (id, state)
values (1, '{"flights": [null, null, null, null], "generated": false}')
on conflict (id) do nothing;

-- Enable real-time updates for this table
alter publication supabase_realtime add table tournament_state;
