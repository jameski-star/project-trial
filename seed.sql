-- Seed Data for NutriCare Platform

-- Insert sample users
INSERT OR IGNORE INTO users (id, email, name, age, gender, weight, height, diet_goal, is_farmer, location_lat, location_lng, region) VALUES 
  (1, 'aisha@nutricare.com', 'Aisha Kariuki', 32, 'female', 65, 165, 'maintain', 0, -1.286389, 36.817223, 'Nairobi'),
  (2, 'kwame@nutricare.com', 'Kwame Mensah', 45, 'male', 78, 175, 'lose', 1, 5.603717, -0.186964, 'Accra'),
  (3, 'ben@nutricare.com', 'Ben Ochieng', 24, 'male', 70, 180, 'gain', 0, -1.292066, 36.821946, 'Nairobi');

-- Insert sample meals
INSERT OR IGNORE INTO meals (user_id, meal_name, meal_type, calories, protein, carbs, fats, source, log_date) VALUES 
  (1, 'Ugali with Sukuma Wiki', 'lunch', 450, 12, 85, 8, 'manual', DATE('now')),
  (1, 'Tea with Mandazi', 'breakfast', 320, 6, 55, 12, 'manual', DATE('now')),
  (2, 'Jollof Rice with Chicken', 'dinner', 680, 35, 75, 22, 'ai_scanner', DATE('now')),
  (3, 'Protein Shake', 'snack', 280, 45, 15, 5, 'manual', DATE('now'));

-- Insert shared food listings
INSERT OR IGNORE INTO shared_food (donor_id, donor_name, description, item_kg, food_type, location_lat, location_lng, address, status, expiry_time, contact_phone) VALUES 
  (1, 'Aisha Kariuki', 'Fresh tomatoes from garden', 15, 'vegetables', -1.286389, 36.817223, 'Kilimani, Nairobi', 'available', DATETIME('now', '+24 hours'), '+254712345678'),
  (2, 'Kwame Mensah', 'Surplus cassava harvest', 50, 'tubers', 5.603717, -0.186964, 'Tema, Accra', 'available', DATETIME('now', '+48 hours'), '+233201234567'),
  (1, 'Aisha Kariuki', 'Cooked beans (packaged)', 8, 'legumes', -1.292066, 36.821946, 'Westlands, Nairobi', 'claimed', DATETIME('now', '+12 hours'), '+254712345678');

-- Insert education tips
INSERT OR IGNORE INTO education_tips (title, category, content, sdg_tags, is_featured) VALUES 
  ('Understanding Balanced Nutrition', 'nutrition', 'A balanced diet includes proteins, carbohydrates, healthy fats, vitamins, and minerals. Learn how to create nutritious meals with locally available foods.', '["2","3"]', 1),
  ('Drought-Resistant Crops for East Africa', 'farming', 'Sorghum, millet, and cowpeas are excellent drought-resistant crops that can thrive in low-water conditions. These crops also have high nutritional value.', '["2","13"]', 1),
  ('Reducing Food Waste at Home', 'sustainability', 'Simple tips to reduce food waste: proper storage, meal planning, composting vegetable scraps, and sharing surplus with neighbors.', '["12"]', 0),
  ('Climate-Smart Agriculture Basics', 'climate', 'Climate-smart agriculture involves practices that increase productivity, enhance resilience, and reduce greenhouse gas emissions.', '["13"]', 1);

-- Insert carbon tracker data
INSERT OR IGNORE INTO carbon_tracker (food_name, avg_co2_per_kg, water_footprint, is_local, is_seasonal) VALUES 
  ('Beef', 27.0, 15400, 0, 1),
  ('Chicken', 6.9, 4300, 1, 1),
  ('Rice', 2.7, 2500, 0, 1),
  ('Beans', 2.0, 4000, 1, 1),
  ('Cassava', 0.5, 500, 1, 1),
  ('Tomatoes', 1.4, 214, 1, 1),
  ('Maize', 1.1, 900, 1, 1),
  ('Sweet Potato', 0.3, 380, 1, 1),
  ('Sukuma Wiki (Kale)', 0.4, 200, 1, 1),
  ('Fish (Tilapia)', 5.4, 3600, 1, 1);

-- Insert market prices
INSERT OR IGNORE INTO market_prices (commodity, region, price, unit, price_date, source) VALUES 
  ('Maize', 'Nairobi', 45, 'kg', DATE('now'), 'Ministry of Agriculture'),
  ('Beans', 'Nairobi', 120, 'kg', DATE('now'), 'Ministry of Agriculture'),
  ('Tomatoes', 'Nairobi', 80, 'kg', DATE('now'), 'Ministry of Agriculture'),
  ('Cassava', 'Accra', 35, 'kg', DATE('now'), 'Ghana Agric Market'),
  ('Rice', 'Accra', 65, 'kg', DATE('now'), 'Ghana Agric Market'),
  ('Maize', 'Accra', 42, 'kg', DATE('now'), 'Ghana Agric Market');

-- Insert weather alerts
INSERT OR IGNORE INTO weather_alerts (region, alert_type, severity, description, start_date, end_date, farming_tips) VALUES 
  ('Nairobi', 'drought', 'medium', 'Below-average rainfall expected for the next 3 weeks', DATE('now'), DATE('now', '+21 days'), 'Consider drought-resistant crops like sorghum and millet. Implement water conservation techniques.'),
  ('Accra', 'heatwave', 'low', 'Temperatures above 35°C expected this week', DATE('now'), DATE('now', '+7 days'), 'Ensure adequate irrigation early morning or evening. Provide shade for sensitive crops.');

-- Insert user goals
INSERT OR IGNORE INTO user_goals (user_id, target_calories, target_protein, target_carbs, target_fats, target_carbon_footprint) VALUES 
  (1, 2000, 60, 250, 65, 5.0),
  (2, 2200, 100, 200, 70, 6.0),
  (3, 2800, 150, 300, 80, 7.0);
