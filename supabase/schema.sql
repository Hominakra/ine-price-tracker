-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).

create table if not exists tracked_products (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique,
  product_name text not null,
  product_url text not null,
  brand text,
  category text,
  sku text,
  tracking_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  price numeric not null,
  stock integer not null,
  currency text not null default 'INR',
  availability text,
  stock_label text,
  seller text,
  delivery text,
  discount_pct numeric,
  rating_label text,
  pending boolean not null default false,
  restocked boolean not null default false,
  price_delta numeric not null default 0,
  scraped_at timestamptz not null default now()
);

create table if not exists scrape_logs (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  status text not null check (status in ('SUCCESS', 'RETRIED', 'FAILED')),
  attempt integer not null,
  price numeric,
  stock integer,
  error_message text,
  duration_ms integer
);

create table if not exists scrape_schedule (
  id text primary key default 'default',
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status text,
  last_reason text,
  last_count integer,
  last_error text
);

insert into scrape_schedule (id) values ('default')
on conflict (id) do nothing;

create index if not exists price_history_product_time
  on price_history (tracked_product_id, scraped_at desc);
create index if not exists scrape_logs_product_time
  on scrape_logs (tracked_product_id, started_at desc);

alter table tracked_products enable row level security;
alter table price_history enable row level security;
alter table scrape_logs enable row level security;
alter table scrape_schedule enable row level security;
