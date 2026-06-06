-- SQL script to set up database tables for the FinSight Financial Tracker.
-- You can run this script directly in the Supabase SQL Editor.

-- 1. Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense'))
);

-- 2. Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    category TEXT NOT NULL UNIQUE,
    limit_amount NUMERIC(12, 2) NOT NULL
);

-- 3. Create assets table (New for v2)
CREATE TABLE IF NOT EXISTS assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    value NUMERIC(12, 2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('cash', 'bank', 'stocks', 'crypto', 'real_estate', 'mutual_funds', 'others'))
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- 5. Create public access policies
-- Since this is a simple local frontend client running on your machine, we enable 
-- public read/insert/update/delete policies. In a production environment, you would 
-- associate items with an authenticated user (using auth.uid()) and restrict access.

-- Transactions policies
CREATE POLICY "Allow public select on transactions" 
ON transactions FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on transactions" 
ON transactions FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on transactions" 
ON transactions FOR UPDATE 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete on transactions" 
ON transactions FOR DELETE 
USING (true);

-- Budgets policies
CREATE POLICY "Allow public select on budgets" 
ON budgets FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on budgets" 
ON budgets FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on budgets" 
ON budgets FOR UPDATE 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete on budgets" 
ON budgets FOR DELETE 
USING (true);

-- Assets policies
CREATE POLICY "Allow public select on assets" 
ON assets FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on assets" 
ON assets FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on assets" 
ON assets FOR UPDATE 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete on assets" 
ON assets FOR DELETE 
USING (true);
