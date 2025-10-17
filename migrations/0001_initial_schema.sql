-- NutriCare Database Schema
-- SDG-Aligned Smart Nutrition Platform

-- Users Table: Profile and health goals
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  weight REAL,
  height REAL,
  diet_goal TEXT DEFAULT 'maintain', -- maintain, lose, gain
  is_farmer BOOLEAN DEFAULT 0,
  location_lat REAL,
  location_lng REAL,
  region TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Meals Table: Daily food logs
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  meal_name TEXT NOT NULL,
  meal_type TEXT NOT NULL, -- breakfast, lunch, dinner, snack
  calories REAL DEFAULT 0,
  protein REAL DEFAULT 0,
  carbs REAL DEFAULT 0,
  fats REAL DEFAULT 0,
  source TEXT DEFAULT 'manual', -- manual, ai_scanner
  image_url TEXT,
  log_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Shared Food Table: Community food sharing map
CREATE TABLE IF NOT EXISTS shared_food (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id INTEGER NOT NULL,
  donor_name TEXT NOT NULL,
  description TEXT NOT NULL,
  item_kg REAL NOT NULL,
  food_type TEXT,
  location_lat REAL NOT NULL,
  location_lng REAL NOT NULL,
  address TEXT,
  status TEXT DEFAULT 'available', -- available, claimed, completed
  claimed_by INTEGER,
  post_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiry_time DATETIME NOT NULL,
  contact_phone TEXT,
  FOREIGN KEY (donor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Education Tips Table: Nutrition and SDG content
CREATE TABLE IF NOT EXISTS education_tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL, -- nutrition, farming, climate, sustainability
  content TEXT NOT NULL,
  image_url TEXT,
  sdg_tags TEXT, -- JSON array of SDG numbers
  is_featured BOOLEAN DEFAULT 0,
  is_cached BOOLEAN DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Carbon Tracker Table: Environmental impact data
CREATE TABLE IF NOT EXISTS carbon_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_name TEXT UNIQUE NOT NULL,
  avg_co2_per_kg REAL NOT NULL,
  water_footprint REAL,
  is_local BOOLEAN DEFAULT 0,
  is_seasonal BOOLEAN DEFAULT 0,
  region TEXT
);

-- Market Prices Table: Climate-smart farming support
CREATE TABLE IF NOT EXISTS market_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commodity TEXT NOT NULL,
  region TEXT NOT NULL,
  price REAL NOT NULL,
  unit TEXT DEFAULT 'kg',
  price_date DATE NOT NULL,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Weather Alerts Table: Farming support
CREATE TABLE IF NOT EXISTS weather_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- drought, flood, frost, heatwave
  severity TEXT NOT NULL, -- low, medium, high
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  farming_tips TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Goals Table: Track nutrition goals
CREATE TABLE IF NOT EXISTS user_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  target_calories REAL,
  target_protein REAL,
  target_carbs REAL,
  target_fats REAL,
  target_carbon_footprint REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_food_status ON shared_food(status);
CREATE INDEX IF NOT EXISTS idx_shared_food_location ON shared_food(location_lat, location_lng);
CREATE INDEX IF NOT EXISTS idx_education_tips_category ON education_tips(category);
CREATE INDEX IF NOT EXISTS idx_market_prices_region ON market_prices(region, price_date);
CREATE INDEX IF NOT EXISTS idx_weather_alerts_region ON weather_alerts(region);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
