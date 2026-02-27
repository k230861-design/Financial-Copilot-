Supabase SQL Schema – AI Financial Co-Pilot

-- =====================================================
-- 1. EXTENSIONS
-- =====================================================

-- For UUID generation
create extension if not exists "uuid-ossp";

-- =====================================================
-- 2. PROFILES TABLE (extends Supabase Auth users)
-- =====================================================

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone default now()
);

-- Auto-create profile after signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =====================================================
-- 3. BUSINESSES
-- =====================================================

create table public.businesses (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade,
    name text not null,
    created_at timestamp with time zone default now()
);

create index idx_business_user on businesses(user_id);

-- =====================================================
-- 4. CATEGORIES
-- =====================================================

create table public.categories (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    type text check (type in ('income', 'expense')),
    created_at timestamp with time zone default now()
);

create index idx_category_type on categories(type);

-- Optional default categories
insert into categories (name, type) values
('Customer Payment', 'income'),
('Service Revenue', 'income'),
('Fuel', 'expense'),
('Tools', 'expense'),
('Rent', 'expense'),
('Utilities', 'expense'),
('Salary', 'expense'),
('Subscription', 'expense'),
('Marketing', 'expense'),
('Misc', 'expense');

-- =====================================================
-- 5. ENTITIES (Customers / Suppliers)
-- =====================================================

create table public.entities (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid references businesses(id) on delete cascade,
    name text not null,
    entity_type text check (entity_type in ('customer', 'supplier')),
    created_at timestamp with time zone default now()
);

create index idx_entities_business on entities(business_id);

-- =====================================================
-- 6. TRANSACTIONS
-- =====================================================

create table public.transactions (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid references businesses(id) on delete cascade,
    date date not null,
    description text,
    amount numeric not null,
    type text check (type in ('income', 'expense')),
    category_id uuid references categories(id),
    entity_id uuid references entities(id),
    created_at timestamp with time zone default now()
);

create index idx_transactions_business on transactions(business_id);
create index idx_transactions_date on transactions(date);
create index idx_transactions_category on transactions(category_id);

-- =====================================================
-- 7. TAGS (Optional)
-- =====================================================

create table public.tags (
    id uuid primary key default uuid_generate_v4(),
    name text unique
);

create table public.transaction_tags (
    transaction_id uuid references transactions(id) on delete cascade,
    tag_id uuid references tags(id) on delete cascade,
    primary key (transaction_id, tag_id)
);

-- =====================================================
-- 8. INSIGHTS
-- =====================================================

create table public.insights (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid references businesses(id) on delete cascade,
    text text not null,
    insight_type text check (insight_type in ('health', 'risk', 'warning', 'opportunity', 'info')),
    severity text check (severity in ('low', 'medium', 'high')),
    created_at timestamp with time zone default now()
);

create index idx_insights_business on insights(business_id);

-- =====================================================
-- 9. USER CORRECTIONS (AI learning)
-- =====================================================

create table public.user_corrections (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid references businesses(id) on delete cascade,
    description_pattern text,
    category_id uuid references categories(id),
    entity_name text,
    created_at timestamp with time zone default now()
);

-- =====================================================
-- 10. RECURRING PATTERNS
-- =====================================================

create table public.recurring_patterns (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid references businesses(id) on delete cascade,
    description_pattern text,
    average_amount numeric,
    frequency text check (frequency in ('weekly', 'monthly')),
    category_id uuid references categories(id),
    created_at timestamp with time zone default now()
);

-- =====================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- =====================================================

alter table profiles enable row level security;
alter table businesses enable row level security;
alter table entities enable row level security;
alter table transactions enable row level security;
alter table insights enable row level security;
alter table user_corrections enable row level security;
alter table recurring_patterns enable row level security;

-- Profiles
create policy "Users can view own profile"
on profiles for select
using (auth.uid() = id);

-- Businesses
create policy "Users manage own businesses"
on businesses
for all
using (auth.uid() = user_id);

-- Entities
create policy "Entities belong to user's business"
on entities
for all
using (
    business_id in (
        select id from businesses where user_id = auth.uid()
    )
);

-- Transactions
create policy "Transactions belong to user's business"
on transactions
for all
using (
    business_id in (
        select id from businesses where user_id = auth.uid()
    )
);

-- Insights
create policy "Insights belong to user's business"
on insights
for all
using (
    business_id in (
        select id from businesses where user_id = auth.uid()
    )
);

-- Corrections
create policy "Corrections belong to user's business"
on user_corrections
for all
using (
    business_id in (
        select id from businesses where user_id = auth.uid()
    )
);

-- Recurring
create policy "Recurring belong to user's business"
on recurring_patterns
for all
using (
    business_id in (
        select id from businesses where user_id = auth.uid()
    )
);


Useful Analytics Queries
1. Financial Summary
select
    sum(case when type = 'income' then amount else 0 end) as total_income,
    sum(case when type = 'expense' then amount else 0 end) as total_expense,
    sum(case when type = 'income' then amount else -amount end) as net_profit
from transactions
where business_id = :business_id;
2. Monthly Trend
select
    date_trunc('month', date) as month,
    sum(case when type = 'income' then amount else 0 end) as income,
    sum(case when type = 'expense' then amount else 0 end) as expense
from transactions
where business_id = :business_id
group by month
order by month;
3. Expense Category Breakdown
select
    c.name,
    sum(t.amount) as total
from transactions t
join categories c on t.category_id = c.id
where t.business_id = :business_id
and t.type = 'expense'
group by c.name
order by total desc;
4. Top Customers
select
    e.name,
    sum(t.amount) as revenue
from transactions t
join entities e on t.entity_id = e.id
where t.business_id = :business_id
and t.type = 'income'
group by e.name
order by revenue desc
limit 5;
5. Average Daily Cashflow (Forecast Base)
select
    sum(case when type='income' then amount else 0 end)/count(distinct date) as avg_daily_income,
    sum(case when type='expense' then amount else 0 end)/count(distinct date) as avg_daily_expense
from transactions
where business_id = :business_id;
Authentication Flow (Supabase + Google)

Frontend:

supabase.auth.signInWithOAuth({
  provider: 'google'
});