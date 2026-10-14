-- Chengdu–Chongqing trip: shared live locations + expense split
-- Tables are locked (RLS on, no policies). The app talks only through the
-- functions below, and every function requires the secret trip code.

create table if not exists trip_groups (
  code text primary key,
  created_at timestamptz not null default now()
);

create table if not exists trip_locations (
  code text not null references trip_groups(code) on delete cascade,
  member text not null,
  lat double precision not null,
  lon double precision not null,
  acc real,
  updated_at timestamptz not null default now(),
  primary key (code, member)
);

create table if not exists trip_expenses (
  id uuid primary key,
  code text not null references trip_groups(code) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency in ('CNY','THB')),
  payer text not null,
  split text[] not null check (cardinality(split) > 0),
  category text,
  spent_at timestamptz not null default now(),
  created_by text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_plan (
  code text not null references trip_groups(code) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (code, id)
);

alter table trip_plan enable row level security;
alter table trip_groups enable row level security;
alter table trip_locations enable row level security;
alter table trip_expenses enable row level security;
revoke all on trip_groups, trip_locations, trip_expenses, trip_plan from anon, authenticated;

create or replace function trip_check(p_code text, p_member text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trip_groups where code = p_code) then
    raise exception 'invalid trip code';
  end if;
  if p_member is not null and p_member not in ('james','link','peach','new','june') then
    raise exception 'invalid member';
  end if;
end $$;

create or replace function trip_ping(p_code text, p_member text, p_lat double precision, p_lon double precision, p_acc real default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform trip_check(p_code, p_member);
  insert into trip_locations(code, member, lat, lon, acc, updated_at)
  values (p_code, p_member, p_lat, p_lon, p_acc, now())
  on conflict (code, member) do update
    set lat = excluded.lat, lon = excluded.lon, acc = excluded.acc, updated_at = now();
end $$;

create or replace function trip_unping(p_code text, p_member text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform trip_check(p_code, p_member);
  delete from trip_locations where code = p_code and member = p_member;
end $$;

create or replace function trip_add_expense(p_code text, p_id uuid, p_title text, p_amount numeric, p_currency text,
  p_payer text, p_split text[], p_category text default null, p_spent_at timestamptz default now(), p_by text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m text;
begin
  perform trip_check(p_code, p_payer);
  foreach m in array p_split loop perform trip_check(p_code, m); end loop;
  insert into trip_expenses(id, code, title, amount, currency, payer, split, category, spent_at, created_by)
  values (p_id, p_code, left(p_title, 120), p_amount, p_currency, p_payer, p_split, p_category, coalesce(p_spent_at, now()), p_by)
  on conflict (id) do nothing;
end $$;

create or replace function trip_del_expense(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform trip_check(p_code);
  update trip_expenses set deleted = true, updated_at = now() where id = p_id and code = p_code;
end $$;

create or replace function trip_state(p_code text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform trip_check(p_code);
  return json_build_object(
    'now', now(),
    'locations', coalesce((select json_agg(json_build_object('member', member, 'lat', lat, 'lon', lon, 'acc', acc, 'at', updated_at))
                           from trip_locations where code = p_code), '[]'::json),
    'expenses', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'amount', amount, 'currency', currency,
                           'payer', payer, 'split', split, 'category', category, 'at', spent_at, 'by', created_by) order by spent_at desc)
                          from trip_expenses where code = p_code and not deleted), '[]'::json),
    'plan', coalesce((select json_agg(json_build_object('id', id, 'data', data, 'at', updated_at)) from trip_plan where code = p_code), '[]'::json)
  );
end $$;

create or replace function trip_plan_put(p_code text, p_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform trip_check(p_code);
  if p_id !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'invalid id'; end if;
  if jsonb_typeof(p_data) <> 'object' or (p_data->>'type') not in ('add','edit') or length(p_data::text) > 4000 then
    raise exception 'invalid plan data';
  end if;
  insert into trip_plan(code, id, data, updated_at) values (p_code, p_id, p_data, now())
  on conflict (code, id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function trip_plan_del(p_code text, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform trip_check(p_code);
  delete from trip_plan where code = p_code and id = p_id;
end $$;

revoke execute on function trip_check(text, text) from public, anon, authenticated;
grant execute on function trip_plan_put(text, text, jsonb) to anon, authenticated;
grant execute on function trip_plan_del(text, text) to anon, authenticated;
grant execute on function trip_ping(text, text, double precision, double precision, real) to anon, authenticated;
grant execute on function trip_unping(text, text) to anon, authenticated;
grant execute on function trip_add_expense(text, uuid, text, numeric, text, text, text[], text, timestamptz, text) to anon, authenticated;
grant execute on function trip_del_expense(text, uuid) to anon, authenticated;
grant execute on function trip_state(text) to anon, authenticated;
