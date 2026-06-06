-- SQL script to set up database tables for the ARC Fit Health Tracker.
-- You can run this script directly in the Supabase SQL Editor.

-- 1. Create health_logs table (one entry per day)
CREATE TABLE IF NOT EXISTS health_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    date DATE NOT NULL UNIQUE,
    steps INTEGER DEFAULT 0 CHECK (steps >= 0),
    calories_consumed INTEGER DEFAULT 0 CHECK (calories_consumed >= 0),
    calories_burned INTEGER DEFAULT 0 CHECK (calories_burned >= 0),
    water_intake INTEGER DEFAULT 0 CHECK (water_intake >= 0), -- in ml
    sleep_duration NUMERIC(4, 2) DEFAULT 0.0 CHECK (sleep_duration >= 0), -- in hours
    weight NUMERIC(5, 2) CHECK (weight >= 0), -- in kg
    mood TEXT,
    notes TEXT
);

-- 2. Create health_goals table
CREATE TABLE IF NOT EXISTS health_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    metric TEXT NOT NULL UNIQUE, -- 'steps', 'calories_consumed', 'calories_burned', 'water_intake', 'sleep_duration', 'weight'
    target_value NUMERIC(10, 2) NOT NULL CHECK (target_value >= 0)
);

-- 3. Create health_vitals table (biometrics history)
CREATE TABLE IF NOT EXISTS health_vitals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name TEXT NOT NULL,
    value NUMERIC(10, 2) NOT NULL CHECK (value >= 0),
    category TEXT NOT NULL CHECK (category IN ('blood_pressure_sys', 'blood_pressure_dia', 'heart_rate', 'blood_sugar', 'cholesterol', 'others'))
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_vitals ENABLE ROW LEVEL SECURITY;

-- 5. Create public access policies (anon client access)
-- Health logs policies
CREATE POLICY "Allow public select on health_logs" ON health_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on health_logs" ON health_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on health_logs" ON health_logs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete on health_logs" ON health_logs FOR DELETE USING (true);

-- Health goals policies
CREATE POLICY "Allow public select on health_goals" ON health_goals FOR SELECT USING (true);
CREATE POLICY "Allow public insert on health_goals" ON health_goals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on health_goals" ON health_goals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete on health_goals" ON health_goals FOR DELETE USING (true);

-- Health vitals policies
CREATE POLICY "Allow public select on health_vitals" ON health_vitals FOR SELECT USING (true);
CREATE POLICY "Allow public insert on health_vitals" ON health_vitals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on health_vitals" ON health_vitals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete on health_vitals" ON health_vitals FOR DELETE USING (true);
