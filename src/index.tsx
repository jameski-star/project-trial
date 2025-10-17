import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ==================== USER ROUTES ====================

// Get all users
app.get('/api/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM users').all()
  return c.json({ success: true, data: results })
})

// Get user by ID
app.get('/api/users/:id', async (c) => {
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).all()
  
  if (results.length === 0) {
    return c.json({ success: false, message: 'User not found' }, 404)
  }
  
  return c.json({ success: true, data: results[0] })
})

// Create user
app.post('/api/users', async (c) => {
  const body = await c.req.json()
  const { email, name, age, gender, weight, height, diet_goal, is_farmer, location_lat, location_lng, region } = body
  
  const result = await c.env.DB.prepare(
    'INSERT INTO users (email, name, age, gender, weight, height, diet_goal, is_farmer, location_lat, location_lng, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(email, name, age, gender, weight, height, diet_goal, is_farmer || 0, location_lat, location_lng, region).run()
  
  return c.json({ success: true, id: result.meta.last_row_id })
})

// Update user
app.put('/api/users/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, age, gender, weight, height, diet_goal, is_farmer, location_lat, location_lng, region } = body
  
  await c.env.DB.prepare(
    'UPDATE users SET name = ?, age = ?, gender = ?, weight = ?, height = ?, diet_goal = ?, is_farmer = ?, location_lat = ?, location_lng = ?, region = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(name, age, gender, weight, height, diet_goal, is_farmer, location_lat, location_lng, region, id).run()
  
  return c.json({ success: true, message: 'User updated' })
})

// ==================== MEALS ROUTES ====================

// Get meals by user ID and date
app.get('/api/meals/:userId', async (c) => {
  const userId = c.req.param('userId')
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]
  
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM meals WHERE user_id = ? AND log_date = ? ORDER BY created_at DESC'
  ).bind(userId, date).all()
  
  return c.json({ success: true, data: results })
})

// Get nutrition summary for user
app.get('/api/meals/:userId/summary', async (c) => {
  const userId = c.req.param('userId')
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]
  
  const { results } = await c.env.DB.prepare(
    'SELECT SUM(calories) as total_calories, SUM(protein) as total_protein, SUM(carbs) as total_carbs, SUM(fats) as total_fats, COUNT(*) as meal_count FROM meals WHERE user_id = ? AND log_date = ?'
  ).bind(userId, date).all()
  
  return c.json({ success: true, data: results[0] })
})

// Log a meal
app.post('/api/meals', async (c) => {
  const body = await c.req.json()
  const { user_id, meal_name, meal_type, calories, protein, carbs, fats, source, image_url, log_date } = body
  
  const date = log_date || new Date().toISOString().split('T')[0]
  
  const result = await c.env.DB.prepare(
    'INSERT INTO meals (user_id, meal_name, meal_type, calories, protein, carbs, fats, source, image_url, log_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(user_id, meal_name, meal_type, calories, protein, carbs, fats, source || 'manual', image_url, date).run()
  
  return c.json({ success: true, id: result.meta.last_row_id })
})

// Delete meal
app.delete('/api/meals/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM meals WHERE id = ?').bind(id).run()
  return c.json({ success: true, message: 'Meal deleted' })
})

// ==================== SHARED FOOD ROUTES ====================

// Get all available shared food
app.get('/api/shared-food', async (c) => {
  const status = c.req.query('status') || 'available'
  
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM shared_food WHERE status = ? AND expiry_time > CURRENT_TIMESTAMP ORDER BY post_date DESC'
  ).bind(status).all()
  
  return c.json({ success: true, data: results })
})

// Get shared food by ID
app.get('/api/shared-food/:id', async (c) => {
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare('SELECT * FROM shared_food WHERE id = ?').bind(id).all()
  
  if (results.length === 0) {
    return c.json({ success: false, message: 'Food listing not found' }, 404)
  }
  
  return c.json({ success: true, data: results[0] })
})

// Post shared food
app.post('/api/shared-food', async (c) => {
  const body = await c.req.json()
  const { donor_id, donor_name, description, item_kg, food_type, location_lat, location_lng, address, contact_phone, hours_until_expiry } = body
  
  const expiry = new Date(Date.now() + (hours_until_expiry || 24) * 60 * 60 * 1000).toISOString()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO shared_food (donor_id, donor_name, description, item_kg, food_type, location_lat, location_lng, address, contact_phone, expiry_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(donor_id, donor_name, description, item_kg, food_type, location_lat, location_lng, address, contact_phone, expiry).run()
  
  return c.json({ success: true, id: result.meta.last_row_id })
})

// Claim shared food
app.post('/api/shared-food/:id/claim', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { claimed_by } = body
  
  await c.env.DB.prepare(
    'UPDATE shared_food SET status = ?, claimed_by = ? WHERE id = ? AND status = ?'
  ).bind('claimed', claimed_by, id, 'available').run()
  
  return c.json({ success: true, message: 'Food claimed successfully' })
})

// Complete shared food transaction
app.post('/api/shared-food/:id/complete', async (c) => {
  const id = c.req.param('id')
  
  await c.env.DB.prepare(
    'UPDATE shared_food SET status = ? WHERE id = ?'
  ).bind('completed', id).run()
  
  return c.json({ success: true, message: 'Transaction completed' })
})

// ==================== EDUCATION TIPS ROUTES ====================

// Get all education tips
app.get('/api/education-tips', async (c) => {
  const category = c.req.query('category')
  
  let query = 'SELECT * FROM education_tips'
  let bindings: any[] = []
  
  if (category) {
    query += ' WHERE category = ?'
    bindings.push(category)
  }
  
  query += ' ORDER BY is_featured DESC, created_at DESC'
  
  const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
  return c.json({ success: true, data: results })
})

// Get education tip by ID
app.get('/api/education-tips/:id', async (c) => {
  const id = c.req.param('id')
  
  // Increment views
  await c.env.DB.prepare('UPDATE education_tips SET views = views + 1 WHERE id = ?').bind(id).run()
  
  const { results } = await c.env.DB.prepare('SELECT * FROM education_tips WHERE id = ?').bind(id).all()
  
  if (results.length === 0) {
    return c.json({ success: false, message: 'Tip not found' }, 404)
  }
  
  return c.json({ success: true, data: results[0] })
})

// ==================== CARBON TRACKER ROUTES ====================

// Get carbon data for food
app.get('/api/carbon-tracker', async (c) => {
  const food_name = c.req.query('food_name')
  
  if (food_name) {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM carbon_tracker WHERE food_name LIKE ?'
    ).bind(`%${food_name}%`).all()
    return c.json({ success: true, data: results })
  }
  
  const { results } = await c.env.DB.prepare('SELECT * FROM carbon_tracker ORDER BY avg_co2_per_kg DESC').all()
  return c.json({ success: true, data: results })
})

// Calculate carbon footprint for meal
app.post('/api/carbon-tracker/calculate', async (c) => {
  const body = await c.req.json()
  const { foods } = body // Array of { food_name, weight_kg }
  
  let total_co2 = 0
  let total_water = 0
  const breakdown = []
  
  for (const food of foods) {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM carbon_tracker WHERE food_name = ?'
    ).bind(food.food_name).all()
    
    if (results.length > 0) {
      const data = results[0] as any
      const co2 = data.avg_co2_per_kg * food.weight_kg
      const water = data.water_footprint * food.weight_kg
      
      total_co2 += co2
      total_water += water
      
      breakdown.push({
        food_name: food.food_name,
        weight_kg: food.weight_kg,
        co2: co2,
        water: water,
        is_local: data.is_local
      })
    }
  }
  
  return c.json({ 
    success: true, 
    data: {
      total_co2_kg: total_co2,
      total_water_liters: total_water,
      breakdown
    }
  })
})

// ==================== MARKET PRICES ROUTES ====================

// Get market prices
app.get('/api/market-prices', async (c) => {
  const region = c.req.query('region')
  
  let query = 'SELECT * FROM market_prices WHERE price_date >= DATE("now", "-7 days")'
  let bindings: any[] = []
  
  if (region) {
    query += ' AND region = ?'
    bindings.push(region)
  }
  
  query += ' ORDER BY price_date DESC, commodity ASC'
  
  const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
  return c.json({ success: true, data: results })
})

// ==================== WEATHER ALERTS ROUTES ====================

// Get weather alerts
app.get('/api/weather-alerts', async (c) => {
  const region = c.req.query('region')
  
  let query = 'SELECT * FROM weather_alerts WHERE end_date IS NULL OR end_date >= DATE("now")'
  let bindings: any[] = []
  
  if (region) {
    query += ' AND region = ?'
    bindings.push(region)
  }
  
  query += ' ORDER BY severity DESC, created_at DESC'
  
  const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
  return c.json({ success: true, data: results })
})

// ==================== USER GOALS ROUTES ====================

// Get user goals
app.get('/api/user-goals/:userId', async (c) => {
  const userId = c.req.param('userId')
  const { results } = await c.env.DB.prepare('SELECT * FROM user_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId).all()
  
  if (results.length === 0) {
    return c.json({ success: false, message: 'No goals found' }, 404)
  }
  
  return c.json({ success: true, data: results[0] })
})

// Create or update user goals
app.post('/api/user-goals', async (c) => {
  const body = await c.req.json()
  const { user_id, target_calories, target_protein, target_carbs, target_fats, target_carbon_footprint } = body
  
  const result = await c.env.DB.prepare(
    'INSERT INTO user_goals (user_id, target_calories, target_protein, target_carbs, target_fats, target_carbon_footprint) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(user_id, target_calories, target_protein, target_carbs, target_fats, target_carbon_footprint).run()
  
  return c.json({ success: true, id: result.meta.last_row_id })
})

// ==================== STATS ROUTES ====================

// Get dashboard stats
app.get('/api/stats/dashboard/:userId', async (c) => {
  const userId = c.req.param('userId')
  
  // Get today's nutrition
  const today = new Date().toISOString().split('T')[0]
  const { results: todayMeals } = await c.env.DB.prepare(
    'SELECT SUM(calories) as total_calories, SUM(protein) as total_protein, SUM(carbs) as total_carbs, SUM(fats) as total_fats FROM meals WHERE user_id = ? AND log_date = ?'
  ).bind(userId, today).all()
  
  // Get goals
  const { results: goals } = await c.env.DB.prepare(
    'SELECT * FROM user_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).all()
  
  // Get available shared food count
  const { results: sharedCount } = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM shared_food WHERE status = ? AND expiry_time > CURRENT_TIMESTAMP'
  ).bind('available').all()
  
  return c.json({
    success: true,
    data: {
      today_nutrition: todayMeals[0],
      goals: goals[0] || null,
      available_shared_food: (sharedCount[0] as any).count
    }
  })
})

// ==================== FRONTEND ROUTES ====================

// Home page
app.get('/', (c) => {
  return c.html(renderHomePage())
})

// Dashboard page
app.get('/dashboard', (c) => {
  return c.html(renderDashboardPage())
})

// Scanner page
app.get('/scanner', (c) => {
  return c.html(renderScannerPage())
})

// Food sharing map page
app.get('/food-map', (c) => {
  return c.html(renderFoodMapPage())
})

// Education page
app.get('/education', (c) => {
  return c.html(renderEducationPage())
})

// ==================== HTML RENDERING FUNCTIONS ====================

function renderHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NutriCare - Smart Nutrition Assistant</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
        }
        .float-animation {
            animation: float 3s ease-in-out infinite;
        }
        .gradient-bg {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .hero-pattern {
            background-color: #667eea;
            background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
    </style>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-lg fixed w-full top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <i class="fas fa-leaf text-green-600 text-2xl mr-2"></i>
                    <span class="text-2xl font-bold text-gray-800">NutriCare</span>
                </div>
                <div class="hidden md:flex items-center space-x-8">
                    <a href="/" class="text-gray-700 hover:text-green-600 font-medium">Home</a>
                    <a href="/dashboard" class="text-gray-700 hover:text-green-600 font-medium">Dashboard</a>
                    <a href="/scanner" class="text-gray-700 hover:text-green-600 font-medium">AI Scanner</a>
                    <a href="/food-map" class="text-gray-700 hover:text-green-600 font-medium">Food Map</a>
                    <a href="/education" class="text-gray-700 hover:text-green-600 font-medium">Learn</a>
                </div>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <section class="hero-pattern pt-24 pb-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div class="text-center text-white">
                <h1 class="text-5xl md:text-6xl font-bold mb-6">
                    Smart Nutrition for a<br/>
                    <span class="text-yellow-300">Sustainable Future</span>
                </h1>
                <p class="text-xl md:text-2xl mb-10 opacity-90">
                    Democratizing nutritional health with AI-powered insights,<br/>
                    community food sharing, and climate-smart guidance
                </p>
                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                    <a href="/dashboard" class="bg-white text-purple-600 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition shadow-lg">
                        <i class="fas fa-rocket mr-2"></i>Get Started
                    </a>
                    <a href="/scanner" class="bg-green-500 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-600 transition shadow-lg">
                        <i class="fas fa-camera mr-2"></i>Try AI Scanner
                    </a>
                </div>
            </div>
        </div>
    </section>

    <!-- SDG Alignment Section -->
    <section class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-4xl font-bold text-center mb-12 text-gray-800">
                <i class="fas fa-globe-africa text-blue-600 mr-2"></i>
                Aligned with UN Sustainable Development Goals
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div class="text-center p-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl shadow-lg text-white transform hover:scale-105 transition">
                    <div class="text-5xl font-bold mb-2">2</div>
                    <h3 class="text-xl font-bold mb-2">Zero Hunger</h3>
                    <p class="text-sm">Community food sharing & market prices</p>
                </div>
                <div class="text-center p-6 bg-gradient-to-br from-green-400 to-teal-500 rounded-xl shadow-lg text-white transform hover:scale-105 transition">
                    <div class="text-5xl font-bold mb-2">3</div>
                    <h3 class="text-xl font-bold mb-2">Good Health</h3>
                    <p class="text-sm">Personalized diet planning & AI tracking</p>
                </div>
                <div class="text-center p-6 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl shadow-lg text-white transform hover:scale-105 transition">
                    <div class="text-5xl font-bold mb-2">12</div>
                    <h3 class="text-xl font-bold mb-2">Responsible Consumption</h3>
                    <p class="text-sm">Carbon footprint tracking & waste reduction</p>
                </div>
                <div class="text-center p-6 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl shadow-lg text-white transform hover:scale-105 transition">
                    <div class="text-5xl font-bold mb-2">13</div>
                    <h3 class="text-xl font-bold mb-2">Climate Action</h3>
                    <p class="text-sm">Climate-smart farming support</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Features Section -->
    <section class="py-16 bg-gray-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-4xl font-bold text-center mb-12 text-gray-800">Powerful Features</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition">
                    <div class="text-5xl mb-4">📸</div>
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">AI Food Scanner</h3>
                    <p class="text-gray-600 mb-4">Upload or capture food photos to instantly get nutritional analysis powered by TensorFlow.js</p>
                    <a href="/scanner" class="text-purple-600 font-semibold hover:underline">Try Now →</a>
                </div>
                <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition">
                    <div class="text-5xl mb-4">🥖</div>
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">Food Sharing Map</h3>
                    <p class="text-gray-600 mb-4">Connect donors and recipients to reduce food waste and fight hunger in your community</p>
                    <a href="/food-map" class="text-purple-600 font-semibold hover:underline">Explore Map →</a>
                </div>
                <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition">
                    <div class="text-5xl mb-4">🌾</div>
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">Farmer Support</h3>
                    <p class="text-gray-600 mb-4">Real-time market prices, weather alerts, and climate-smart farming tips for smallholders</p>
                    <a href="/dashboard" class="text-purple-600 font-semibold hover:underline">Access Dashboard →</a>
                </div>
                <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition">
                    <div class="text-5xl mb-4">🧑‍⚕️</div>
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">Personalized Plans</h3>
                    <p class="text-gray-600 mb-4">Get tailored weekly meal plans based on your health goals and dietary preferences</p>
                    <a href="/dashboard" class="text-purple-600 font-semibold hover:underline">View Dashboard →</a>
                </div>
                <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition">
                    <div class="text-5xl mb-4">🌍</div>
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">Carbon Tracker</h3>
                    <p class="text-gray-600 mb-4">Track environmental impact of your meals and discover low-carbon, local alternatives</p>
                    <a href="/dashboard" class="text-purple-600 font-semibold hover:underline">Calculate Impact →</a>
                </div>
                <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition">
                    <div class="text-5xl mb-4">📚</div>
                    <h3 class="text-2xl font-bold mb-4 text-gray-800">Education Hub</h3>
                    <p class="text-gray-600 mb-4">Access multilingual educational content on nutrition, farming, and sustainability</p>
                    <a href="/education" class="text-purple-600 font-semibold hover:underline">Learn More →</a>
                </div>
            </div>
        </div>
    </section>

    <!-- User Personas Section -->
    <section class="py-16 bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-4xl font-bold text-center mb-12 text-gray-800">Built for Everyone</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="text-center p-8">
                    <div class="w-24 h-24 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-4xl">
                        <i class="fas fa-user-nurse"></i>
                    </div>
                    <h3 class="text-2xl font-bold mb-2 text-gray-800">Caregivers</h3>
                    <p class="text-gray-600">Access offline meal plans and culturally relevant recipes for your family</p>
                </div>
                <div class="text-center p-8">
                    <div class="w-24 h-24 bg-gradient-to-br from-green-400 to-teal-500 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-4xl">
                        <i class="fas fa-tractor"></i>
                    </div>
                    <h3 class="text-2xl font-bold mb-2 text-gray-800">Farmers</h3>
                    <p class="text-gray-600">Get market prices, weather alerts, and maximize crop income</p>
                </div>
                <div class="text-center p-8">
                    <div class="w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-4xl">
                        <i class="fas fa-heart"></i>
                    </div>
                    <h3 class="text-2xl font-bold mb-2 text-gray-800">NGOs & Donors</h3>
                    <p class="text-gray-600">Efficiently route food donations and measure verifiable impact</p>
                </div>
            </div>
        </div>
    </section>

    <!-- CTA Section -->
    <section class="gradient-bg py-20">
        <div class="max-w-4xl mx-auto text-center px-4">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
                Join the Movement Today
            </h2>
            <p class="text-xl text-white opacity-90 mb-8">
                Start your journey towards better nutrition and a sustainable future
            </p>
            <a href="/dashboard" class="bg-white text-purple-600 px-10 py-4 rounded-lg font-bold text-xl hover:bg-gray-100 transition shadow-xl inline-block">
                <i class="fas fa-arrow-right mr-2"></i>Start Now - It's Free
            </a>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-800 text-white py-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div>
                    <div class="flex items-center mb-4">
                        <i class="fas fa-leaf text-green-500 text-2xl mr-2"></i>
                        <span class="text-2xl font-bold">NutriCare</span>
                    </div>
                    <p class="text-gray-400">Democratizing nutritional health for a sustainable future</p>
                </div>
                <div>
                    <h4 class="text-lg font-bold mb-4">Features</h4>
                    <ul class="space-y-2 text-gray-400">
                        <li><a href="/scanner" class="hover:text-white">AI Scanner</a></li>
                        <li><a href="/food-map" class="hover:text-white">Food Map</a></li>
                        <li><a href="/dashboard" class="hover:text-white">Dashboard</a></li>
                        <li><a href="/education" class="hover:text-white">Education</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="text-lg font-bold mb-4">SDG Goals</h4>
                    <ul class="space-y-2 text-gray-400">
                        <li>SDG 2: Zero Hunger</li>
                        <li>SDG 3: Good Health</li>
                        <li>SDG 12: Responsible Consumption</li>
                        <li>SDG 13: Climate Action</li>
                    </ul>
                </div>
                <div>
                    <h4 class="text-lg font-bold mb-4">Technology</h4>
                    <ul class="space-y-2 text-gray-400">
                        <li>Hono Framework</li>
                        <li>Cloudflare D1</li>
                        <li>TensorFlow.js</li>
                        <li>PWA Enabled</li>
                    </ul>
                </div>
            </div>
            <div class="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
                <p>&copy; 2024 NutriCare. Built with ❤️ for sustainable development.</p>
            </div>
        </div>
    </footer>
</body>
</html>`
}

function renderDashboardPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - NutriCare</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <i class="fas fa-leaf text-green-600 text-2xl mr-2"></i>
                    <span class="text-2xl font-bold text-gray-800">NutriCare</span>
                </div>
                <div class="flex items-center space-x-8">
                    <a href="/" class="text-gray-700 hover:text-green-600">Home</a>
                    <a href="/dashboard" class="text-green-600 font-bold">Dashboard</a>
                    <a href="/scanner" class="text-gray-700 hover:text-green-600">AI Scanner</a>
                    <a href="/food-map" class="text-gray-700 hover:text-green-600">Food Map</a>
                    <a href="/education" class="text-gray-700 hover:text-green-600">Learn</a>
                </div>
            </div>
        </div>
    </nav>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Header -->
        <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-800 mb-2">
                <i class="fas fa-chart-line text-green-600 mr-2"></i>
                Dashboard
            </h1>
            <p class="text-gray-600">Welcome back! Here's your nutrition overview for today.</p>
        </div>

        <!-- User Selection -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
            <label class="block text-sm font-semibold text-gray-700 mb-2">Select Your Profile</label>
            <select id="userSelect" class="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
                <option value="1">Aisha Kariuki (Caregiver)</option>
                <option value="2">Kwame Mensah (Farmer)</option>
                <option value="3">Ben Ochieng (Youth)</option>
            </select>
        </div>

        <!-- Stats Overview -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8" id="statsCards">
            <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                <div class="flex items-center justify-between mb-2">
                    <i class="fas fa-fire text-3xl"></i>
                    <span class="text-sm opacity-75">Calories</span>
                </div>
                <div class="text-3xl font-bold" id="caloriesValue">0</div>
                <div class="text-sm opacity-75">of <span id="caloriesGoal">2000</span> kcal</div>
                <div class="mt-2 bg-white bg-opacity-20 rounded-full h-2">
                    <div id="caloriesProgress" class="bg-white rounded-full h-2" style="width: 0%"></div>
                </div>
            </div>

            <div class="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                <div class="flex items-center justify-between mb-2">
                    <i class="fas fa-drumstick-bite text-3xl"></i>
                    <span class="text-sm opacity-75">Protein</span>
                </div>
                <div class="text-3xl font-bold" id="proteinValue">0</div>
                <div class="text-sm opacity-75">of <span id="proteinGoal">60</span> g</div>
                <div class="mt-2 bg-white bg-opacity-20 rounded-full h-2">
                    <div id="proteinProgress" class="bg-white rounded-full h-2" style="width: 0%"></div>
                </div>
            </div>

            <div class="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                <div class="flex items-center justify-between mb-2">
                    <i class="fas fa-bread-slice text-3xl"></i>
                    <span class="text-sm opacity-75">Carbs</span>
                </div>
                <div class="text-3xl font-bold" id="carbsValue">0</div>
                <div class="text-sm opacity-75">of <span id="carbsGoal">250</span> g</div>
                <div class="mt-2 bg-white bg-opacity-20 rounded-full h-2">
                    <div id="carbsProgress" class="bg-white rounded-full h-2" style="width: 0%"></div>
                </div>
            </div>

            <div class="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
                <div class="flex items-center justify-between mb-2">
                    <i class="fas fa-globe text-3xl"></i>
                    <span class="text-sm opacity-75">Carbon</span>
                </div>
                <div class="text-3xl font-bold" id="carbonValue">0</div>
                <div class="text-sm opacity-75">kg CO₂</div>
                <div class="mt-2">
                    <span id="carbonBadge" class="px-2 py-1 bg-white bg-opacity-20 rounded text-xs">Low Impact</span>
                </div>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Today's Meals -->
            <div class="lg:col-span-2">
                <div class="bg-white rounded-xl shadow-lg p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-utensils text-green-600 mr-2"></i>
                            Today's Meals
                        </h2>
                        <button onclick="addMeal()" class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition">
                            <i class="fas fa-plus mr-2"></i>Add Meal
                        </button>
                    </div>
                    <div id="mealsList" class="space-y-4">
                        <!-- Meals will be loaded here -->
                    </div>
                </div>

                <!-- Farmer's Market Board (for farmers) -->
                <div id="farmerSection" class="bg-white rounded-xl shadow-lg p-6 mt-8" style="display: none;">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">
                        <i class="fas fa-chart-line text-green-600 mr-2"></i>
                        Market Price Board
                    </h2>
                    <div id="marketPrices" class="space-y-3">
                        <!-- Market prices will be loaded here -->
                    </div>
                </div>

                <!-- Weather Alerts (for farmers) -->
                <div id="weatherSection" class="bg-white rounded-xl shadow-lg p-6 mt-8" style="display: none;">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">
                        <i class="fas fa-cloud-sun text-yellow-500 mr-2"></i>
                        Weather Alerts
                    </h2>
                    <div id="weatherAlerts" class="space-y-3">
                        <!-- Weather alerts will be loaded here -->
                    </div>
                </div>
            </div>

            <!-- Sidebar -->
            <div class="space-y-8">
                <!-- Nutrition Chart -->
                <div class="bg-white rounded-xl shadow-lg p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Macros Breakdown</h3>
                    <canvas id="macrosChart"></canvas>
                </div>

                <!-- Quick Actions -->
                <div class="bg-white rounded-xl shadow-lg p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Quick Actions</h3>
                    <div class="space-y-3">
                        <a href="/scanner" class="block w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-purple-600 hover:to-purple-700 transition text-center">
                            <i class="fas fa-camera mr-2"></i>Scan Food
                        </a>
                        <a href="/food-map" class="block w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition text-center">
                            <i class="fas fa-map-marked-alt mr-2"></i>Food Map
                        </a>
                        <a href="/education" class="block w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-4 rounded-lg hover:from-blue-600 hover:to-blue-700 transition text-center">
                            <i class="fas fa-book mr-2"></i>Learn More
                        </a>
                    </div>
                </div>

                <!-- Carbon Impact -->
                <div class="bg-gradient-to-br from-green-50 to-teal-50 rounded-xl shadow-lg p-6 border-2 border-green-200">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-leaf text-green-600 mr-2"></i>
                        Sustainability Tip
                    </h3>
                    <p class="text-gray-700 mb-4">Choose local, seasonal vegetables to reduce your carbon footprint by up to 50%!</p>
                    <div class="flex items-center text-sm text-gray-600">
                        <i class="fas fa-info-circle mr-2"></i>
                        <span>Learn more about sustainable eating</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentUserId = 1;
        let macrosChart = null;

        // User selection handler
        document.getElementById('userSelect').addEventListener('change', function(e) {
            currentUserId = e.target.value;
            loadDashboard();
        });

        // Load dashboard data
        async function loadDashboard() {
            try {
                // Load stats
                const statsResponse = await axios.get(\`/api/stats/dashboard/\${currentUserId}\`);
                const stats = statsResponse.data.data;

                // Update stats cards
                updateStatsCards(stats);

                // Load meals
                const mealsResponse = await axios.get(\`/api/meals/\${currentUserId}\`);
                displayMeals(mealsResponse.data.data);

                // Check if user is farmer
                const userResponse = await axios.get(\`/api/users/\${currentUserId}\`);
                const user = userResponse.data.data;
                
                if (user.is_farmer) {
                    document.getElementById('farmerSection').style.display = 'block';
                    document.getElementById('weatherSection').style.display = 'block';
                    loadMarketPrices(user.region);
                    loadWeatherAlerts(user.region);
                }
            } catch (error) {
                console.error('Error loading dashboard:', error);
            }
        }

        function updateStatsCards(stats) {
            const nutrition = stats.today_nutrition;
            const goals = stats.goals || {
                target_calories: 2000,
                target_protein: 60,
                target_carbs: 250,
                target_fats: 65
            };

            // Update values
            document.getElementById('caloriesValue').textContent = Math.round(nutrition.total_calories || 0);
            document.getElementById('caloriesGoal').textContent = goals.target_calories;
            document.getElementById('proteinValue').textContent = Math.round(nutrition.total_protein || 0);
            document.getElementById('proteinGoal').textContent = goals.target_protein;
            document.getElementById('carbsValue').textContent = Math.round(nutrition.total_carbs || 0);
            document.getElementById('carbsGoal').textContent = goals.target_carbs;

            // Update progress bars
            const caloriesPercent = ((nutrition.total_calories || 0) / goals.target_calories * 100).toFixed(0);
            const proteinPercent = ((nutrition.total_protein || 0) / goals.target_protein * 100).toFixed(0);
            const carbsPercent = ((nutrition.total_carbs || 0) / goals.target_carbs * 100).toFixed(0);

            document.getElementById('caloriesProgress').style.width = \`\${Math.min(caloriesPercent, 100)}%\`;
            document.getElementById('proteinProgress').style.width = \`\${Math.min(proteinPercent, 100)}%\`;
            document.getElementById('carbsProgress').style.width = \`\${Math.min(carbsPercent, 100)}%\`;

            // Update chart
            updateMacrosChart(nutrition);
        }

        function updateMacrosChart(nutrition) {
            const ctx = document.getElementById('macrosChart');
            
            if (macrosChart) {
                macrosChart.destroy();
            }

            macrosChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Protein', 'Carbs', 'Fats'],
                    datasets: [{
                        data: [
                            nutrition.total_protein || 0,
                            nutrition.total_carbs || 0,
                            nutrition.total_fats || 0
                        ],
                        backgroundColor: ['#8b5cf6', '#10b981', '#f59e0b']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        function displayMeals(meals) {
            const container = document.getElementById('mealsList');
            
            if (meals.length === 0) {
                container.innerHTML = \`
                    <div class="text-center py-8 text-gray-500">
                        <i class="fas fa-utensils text-4xl mb-2"></i>
                        <p>No meals logged today. Start by adding your first meal!</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = meals.map(meal => \`
                <div class="border-l-4 border-green-500 bg-gray-50 p-4 rounded-r-lg">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center mb-2">
                                <span class="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded mr-2">
                                    \${meal.meal_type}
                                </span>
                                <h4 class="text-lg font-semibold text-gray-800">\${meal.meal_name}</h4>
                            </div>
                            <div class="grid grid-cols-4 gap-4 text-sm text-gray-600">
                                <div>
                                    <i class="fas fa-fire text-orange-500 mr-1"></i>
                                    <span class="font-semibold">\${Math.round(meal.calories)}</span> cal
                                </div>
                                <div>
                                    <i class="fas fa-drumstick-bite text-purple-500 mr-1"></i>
                                    <span class="font-semibold">\${Math.round(meal.protein)}</span>g
                                </div>
                                <div>
                                    <i class="fas fa-bread-slice text-green-500 mr-1"></i>
                                    <span class="font-semibold">\${Math.round(meal.carbs)}</span>g
                                </div>
                                <div>
                                    <i class="fas fa-cheese text-yellow-500 mr-1"></i>
                                    <span class="font-semibold">\${Math.round(meal.fats)}</span>g
                                </div>
                            </div>
                        </div>
                        <button onclick="deleteMeal(\${meal.id})" class="text-red-500 hover:text-red-700 ml-4">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            \`).join('');
        }

        async function loadMarketPrices(region) {
            try {
                const response = await axios.get(\`/api/market-prices?region=\${region}\`);
                const prices = response.data.data;

                const container = document.getElementById('marketPrices');
                container.innerHTML = prices.map(price => \`
                    <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                            <h4 class="font-semibold text-gray-800">\${price.commodity}</h4>
                            <p class="text-sm text-gray-500">\${new Date(price.price_date).toLocaleDateString()}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xl font-bold text-green-600">\${price.price}</p>
                            <p class="text-sm text-gray-500">per \${price.unit}</p>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Error loading market prices:', error);
            }
        }

        async function loadWeatherAlerts(region) {
            try {
                const response = await axios.get(\`/api/weather-alerts?region=\${region}\`);
                const alerts = response.data.data;

                const container = document.getElementById('weatherAlerts');
                
                if (alerts.length === 0) {
                    container.innerHTML = '<p class="text-gray-500">No active weather alerts</p>';
                    return;
                }

                container.innerHTML = alerts.map(alert => {
                    const severityColors = {
                        high: 'bg-red-100 border-red-500 text-red-800',
                        medium: 'bg-orange-100 border-orange-500 text-orange-800',
                        low: 'bg-yellow-100 border-yellow-500 text-yellow-800'
                    };

                    return \`
                        <div class="border-l-4 p-4 rounded-r-lg \${severityColors[alert.severity]}">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold">\${alert.alert_type.toUpperCase()}</h4>
                                <span class="text-xs px-2 py-1 bg-white rounded">\${alert.severity}</span>
                            </div>
                            <p class="text-sm mb-2">\${alert.description}</p>
                            <p class="text-xs italic">\${alert.farming_tips}</p>
                        </div>
                    \`;
                }).join('');
            } catch (error) {
                console.error('Error loading weather alerts:', error);
            }
        }

        function addMeal() {
            const meal = prompt('Enter meal name:');
            if (!meal) return;

            const calories = prompt('Calories:') || 0;
            const protein = prompt('Protein (g):') || 0;
            const carbs = prompt('Carbs (g):') || 0;
            const fats = prompt('Fats (g):') || 0;
            const type = prompt('Meal type (breakfast/lunch/dinner/snack):') || 'snack';

            axios.post('/api/meals', {
                user_id: currentUserId,
                meal_name: meal,
                meal_type: type,
                calories: parseFloat(calories),
                protein: parseFloat(protein),
                carbs: parseFloat(carbs),
                fats: parseFloat(fats),
                source: 'manual'
            }).then(() => {
                loadDashboard();
            }).catch(error => {
                console.error('Error adding meal:', error);
                alert('Error adding meal');
            });
        }

        async function deleteMeal(id) {
            if (!confirm('Delete this meal?')) return;

            try {
                await axios.delete(\`/api/meals/\${id}\`);
                loadDashboard();
            } catch (error) {
                console.error('Error deleting meal:', error);
            }
        }

        // Initial load
        loadDashboard();
    </script>
</body>
</html>`
}

function renderScannerPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Food Scanner - NutriCare</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <i class="fas fa-leaf text-green-600 text-2xl mr-2"></i>
                    <span class="text-2xl font-bold text-gray-800">NutriCare</span>
                </div>
                <div class="flex items-center space-x-8">
                    <a href="/" class="text-gray-700 hover:text-green-600">Home</a>
                    <a href="/dashboard" class="text-gray-700 hover:text-green-600">Dashboard</a>
                    <a href="/scanner" class="text-green-600 font-bold">AI Scanner</a>
                    <a href="/food-map" class="text-gray-700 hover:text-green-600">Food Map</a>
                    <a href="/education" class="text-gray-700 hover:text-green-600">Learn</a>
                </div>
            </div>
        </div>
    </nav>

    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Header -->
        <div class="text-center mb-8">
            <h1 class="text-4xl font-bold text-gray-800 mb-4">
                <i class="fas fa-camera text-purple-600 mr-2"></i>
                AI Food Scanner
            </h1>
            <p class="text-gray-600 text-lg">Upload or capture a photo of your food for instant nutritional analysis</p>
        </div>

        <!-- Scanner Card -->
        <div class="bg-white rounded-xl shadow-2xl p-8 mb-8">
            <!-- Upload Area -->
            <div id="uploadArea" class="border-4 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-purple-500 transition cursor-pointer">
                <i class="fas fa-cloud-upload-alt text-6xl text-gray-400 mb-4"></i>
                <h3 class="text-xl font-semibold text-gray-700 mb-2">Drop your food photo here</h3>
                <p class="text-gray-500 mb-4">or click to browse</p>
                <input type="file" id="fileInput" accept="image/*" class="hidden">
                <button onclick="document.getElementById('fileInput').click()" class="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition">
                    <i class="fas fa-upload mr-2"></i>Choose Photo
                </button>
                <div class="mt-4">
                    <button onclick="captureFromCamera()" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition">
                        <i class="fas fa-camera mr-2"></i>Use Camera
                    </button>
                </div>
            </div>

            <!-- Preview Area -->
            <div id="previewArea" class="hidden mt-8">
                <img id="previewImage" class="w-full rounded-xl mb-4" />
                <button onclick="analyzeFood()" class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-lg font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition">
                    <i class="fas fa-magic mr-2"></i>Analyze with AI
                </button>
            </div>

            <!-- Loading -->
            <div id="loadingArea" class="hidden text-center py-8">
                <i class="fas fa-spinner fa-spin text-6xl text-purple-600 mb-4"></i>
                <p class="text-lg text-gray-600">Analyzing your food...</p>
            </div>

            <!-- Results Area -->
            <div id="resultsArea" class="hidden mt-8">
                <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
                    <h3 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-check-circle text-green-600 mr-2"></i>
                        Analysis Complete
                    </h3>
                    
                    <!-- Food Identified -->
                    <div class="bg-white rounded-lg p-4 mb-4">
                        <p class="text-gray-600 mb-2">Detected Food:</p>
                        <h4 id="foodName" class="text-3xl font-bold text-purple-600">Cassava</h4>
                    </div>

                    <!-- Nutrition Info -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div class="bg-white rounded-lg p-4 text-center">
                            <i class="fas fa-fire text-orange-500 text-2xl mb-2"></i>
                            <p class="text-gray-600 text-sm">Calories</p>
                            <p id="calories" class="text-2xl font-bold text-gray-800">350</p>
                        </div>
                        <div class="bg-white rounded-lg p-4 text-center">
                            <i class="fas fa-drumstick-bite text-purple-500 text-2xl mb-2"></i>
                            <p class="text-gray-600 text-sm">Protein</p>
                            <p id="protein" class="text-2xl font-bold text-gray-800">5g</p>
                        </div>
                        <div class="bg-white rounded-lg p-4 text-center">
                            <i class="fas fa-bread-slice text-green-500 text-2xl mb-2"></i>
                            <p class="text-gray-600 text-sm">Carbs</p>
                            <p id="carbs" class="text-2xl font-bold text-gray-800">80g</p>
                        </div>
                        <div class="bg-white rounded-lg p-4 text-center">
                            <i class="fas fa-cheese text-yellow-500 text-2xl mb-2"></i>
                            <p class="text-gray-600 text-sm">Fats</p>
                            <p id="fats" class="text-2xl font-bold text-gray-800">0.5g</p>
                        </div>
                    </div>

                    <!-- Carbon Impact -->
                    <div class="bg-white rounded-lg p-4 mb-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-600 mb-1">Carbon Footprint</p>
                                <p id="carbonImpact" class="text-2xl font-bold text-green-600">0.3 kg CO₂</p>
                            </div>
                            <div id="carbonBadge" class="px-4 py-2 bg-green-100 text-green-700 rounded-full font-semibold">
                                <i class="fas fa-leaf mr-1"></i>Low Impact
                            </div>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex gap-4">
                        <button onclick="logMeal()" class="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition">
                            <i class="fas fa-check mr-2"></i>Log to Dashboard
                        </button>
                        <button onclick="resetScanner()" class="flex-1 bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition">
                            <i class="fas fa-redo mr-2"></i>Scan Another
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- How It Works -->
        <div class="bg-white rounded-xl shadow-lg p-8">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">
                <i class="fas fa-lightbulb text-yellow-500 mr-2"></i>
                How It Works
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="text-center">
                    <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-upload text-purple-600 text-2xl"></i>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">1. Upload Photo</h3>
                    <p class="text-gray-600 text-sm">Take or upload a clear photo of your food</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-brain text-green-600 text-2xl"></i>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">2. AI Analysis</h3>
                    <p class="text-gray-600 text-sm">TensorFlow.js identifies food and calculates nutrition</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-chart-bar text-blue-600 text-2xl"></i>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">3. Get Insights</h3>
                    <p class="text-gray-600 text-sm">View nutrition facts and environmental impact</p>
                </div>
            </div>
        </div>

        <!-- Supported Foods -->
        <div class="mt-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
            <h3 class="text-lg font-semibold text-gray-800 mb-3">
                <i class="fas fa-utensils text-purple-600 mr-2"></i>
                Currently Supports
            </h3>
            <div class="flex flex-wrap gap-2">
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Cassava</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Rice</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Beans</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Maize</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Tomatoes</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Sukuma Wiki</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Sweet Potato</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Fish</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">Chicken</span>
                <span class="px-3 py-1 bg-white rounded-full text-sm text-gray-700">+ More</span>
            </div>
            <p class="text-xs text-gray-500 mt-3">
                <i class="fas fa-info-circle mr-1"></i>
                Note: This is a demo. In production, TensorFlow.js models would be loaded for real-time recognition.
            </p>
        </div>
    </div>

    <script>
        let selectedImage = null;
        let currentAnalysis = null;

        // File input handler
        document.getElementById('fileInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    selectedImage = e.target.result;
                    showPreview(selectedImage);
                };
                reader.readAsDataURL(file);
            }
        });

        function showPreview(imageSrc) {
            document.getElementById('uploadArea').classList.add('hidden');
            document.getElementById('previewArea').classList.remove('hidden');
            document.getElementById('previewImage').src = imageSrc;
            document.getElementById('resultsArea').classList.add('hidden');
        }

        function captureFromCamera() {
            alert('Camera feature would use getUserMedia API in production. For demo, please upload a photo.');
        }

        function analyzeFood() {
            // Show loading
            document.getElementById('previewArea').classList.add('hidden');
            document.getElementById('loadingArea').classList.remove('hidden');

            // Simulate AI analysis (in production, this would call TensorFlow.js)
            setTimeout(() => {
                // Mock data - in production, this would come from TensorFlow.js model
                const mockFoods = [
                    { name: 'Cassava', calories: 350, protein: 5, carbs: 80, fats: 0.5, co2: 0.3 },
                    { name: 'Rice', calories: 360, protein: 7, carbs: 78, fats: 0.7, co2: 2.7 },
                    { name: 'Beans', calories: 340, protein: 21, carbs: 63, fats: 1.5, co2: 2.0 },
                    { name: 'Ugali with Sukuma Wiki', calories: 450, protein: 12, carbs: 85, fats: 8, co2: 1.5 },
                    { name: 'Jollof Rice with Chicken', calories: 680, protein: 35, carbs: 75, fats: 22, co2: 8.5 }
                ];

                const randomFood = mockFoods[Math.floor(Math.random() * mockFoods.length)];
                currentAnalysis = randomFood;

                // Update UI
                document.getElementById('foodName').textContent = randomFood.name;
                document.getElementById('calories').textContent = randomFood.calories;
                document.getElementById('protein').textContent = randomFood.protein + 'g';
                document.getElementById('carbs').textContent = randomFood.carbs + 'g';
                document.getElementById('fats').textContent = randomFood.fats + 'g';
                document.getElementById('carbonImpact').textContent = randomFood.co2 + ' kg CO₂';

                // Update carbon badge
                const badge = document.getElementById('carbonBadge');
                if (randomFood.co2 < 2) {
                    badge.className = 'px-4 py-2 bg-green-100 text-green-700 rounded-full font-semibold';
                    badge.innerHTML = '<i class="fas fa-leaf mr-1"></i>Low Impact';
                } else if (randomFood.co2 < 5) {
                    badge.className = 'px-4 py-2 bg-yellow-100 text-yellow-700 rounded-full font-semibold';
                    badge.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Medium Impact';
                } else {
                    badge.className = 'px-4 py-2 bg-red-100 text-red-700 rounded-full font-semibold';
                    badge.innerHTML = '<i class="fas fa-fire mr-1"></i>High Impact';
                }

                // Show results
                document.getElementById('loadingArea').classList.add('hidden');
                document.getElementById('resultsArea').classList.remove('hidden');
            }, 2000);
        }

        async function logMeal() {
            if (!currentAnalysis) return;

            const userId = 1; // In production, get from auth
            const mealType = prompt('Meal type (breakfast/lunch/dinner/snack):') || 'snack';

            try {
                await axios.post('/api/meals', {
                    user_id: userId,
                    meal_name: currentAnalysis.name,
                    meal_type: mealType,
                    calories: currentAnalysis.calories,
                    protein: currentAnalysis.protein,
                    carbs: currentAnalysis.carbs,
                    fats: currentAnalysis.fats,
                    source: 'ai_scanner'
                });

                alert('Meal logged successfully! View it on your dashboard.');
                window.location.href = '/dashboard';
            } catch (error) {
                console.error('Error logging meal:', error);
                alert('Error logging meal. Please try again.');
            }
        }

        function resetScanner() {
            document.getElementById('uploadArea').classList.remove('hidden');
            document.getElementById('previewArea').classList.add('hidden');
            document.getElementById('resultsArea').classList.add('hidden');
            document.getElementById('fileInput').value = '';
            selectedImage = null;
            currentAnalysis = null;
        }
    </script>
</body>
</html>`
}

function renderFoodMapPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Community Food Map - NutriCare</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <style>
        #map {
            height: 600px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            text-align: center;
            padding: 40px;
        }
    </style>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <i class="fas fa-leaf text-green-600 text-2xl mr-2"></i>
                    <span class="text-2xl font-bold text-gray-800">NutriCare</span>
                </div>
                <div class="flex items-center space-x-8">
                    <a href="/" class="text-gray-700 hover:text-green-600">Home</a>
                    <a href="/dashboard" class="text-gray-700 hover:text-green-600">Dashboard</a>
                    <a href="/scanner" class="text-gray-700 hover:text-green-600">AI Scanner</a>
                    <a href="/food-map" class="text-green-600 font-bold">Food Map</a>
                    <a href="/education" class="text-gray-700 hover:text-green-600">Learn</a>
                </div>
            </div>
        </div>
    </nav>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Header -->
        <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-800 mb-2">
                <i class="fas fa-map-marked-alt text-green-600 mr-2"></i>
                Community Food Sharing Map
            </h1>
            <p class="text-gray-600">Connect donors and recipients to reduce food waste and fight hunger</p>
        </div>

        <!-- Stats Bar -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-white rounded-lg shadow-lg p-4 text-center">
                <div class="text-3xl font-bold text-green-600" id="availableCount">0</div>
                <div class="text-sm text-gray-600">Available Now</div>
            </div>
            <div class="bg-white rounded-lg shadow-lg p-4 text-center">
                <div class="text-3xl font-bold text-blue-600" id="totalShared">0 kg</div>
                <div class="text-sm text-gray-600">Food Shared</div>
            </div>
            <div class="bg-white rounded-lg shadow-lg p-4 text-center">
                <div class="text-3xl font-bold text-purple-600" id="co2Saved">0 kg</div>
                <div class="text-sm text-gray-600">CO₂ Saved</div>
            </div>
            <div class="bg-white rounded-lg shadow-lg p-4 text-center">
                <div class="text-3xl font-bold text-orange-600" id="peopleHelped">0</div>
                <div class="text-sm text-gray-600">People Helped</div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Map Area -->
            <div class="lg:col-span-2">
                <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div id="map" class="rounded-t-xl">
                        <div>
                            <i class="fas fa-map-marked-alt text-6xl mb-4 opacity-50"></i>
                            <p class="text-lg">Google Maps integration would appear here</p>
                            <p class="text-sm opacity-75 mt-2">In production: Interactive map with food donation markers</p>
                        </div>
                    </div>
                </div>

                <!-- Add Food Button -->
                <button onclick="showAddModal()" class="mt-6 w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-teal-600 transition shadow-lg">
                    <i class="fas fa-plus-circle mr-2"></i>Share Food
                </button>
            </div>

            <!-- Listings Sidebar -->
            <div>
                <div class="bg-white rounded-xl shadow-lg p-6">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-list text-green-600 mr-2"></i>
                        Available Food
                    </h2>

                    <!-- Filter -->
                    <div class="mb-4">
                        <select id="statusFilter" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                            <option value="available">Available</option>
                            <option value="claimed">Claimed</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>

                    <!-- Listings -->
                    <div id="foodListings" class="space-y-4 max-h-[600px] overflow-y-auto">
                        <!-- Food listings will be loaded here -->
                    </div>
                </div>
            </div>
        </div>

        <!-- How It Works -->
        <div class="mt-12 bg-white rounded-xl shadow-lg p-8">
            <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">How Food Sharing Works</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="text-center">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-hand-holding-heart text-green-600 text-2xl"></i>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">1. Donors Share</h3>
                    <p class="text-gray-600 text-sm">Post surplus food with location and expiry time</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-search-location text-blue-600 text-2xl"></i>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">2. Recipients Find</h3>
                    <p class="text-gray-600 text-sm">Browse map and claim nearby food donations</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-hands-helping text-purple-600 text-2xl"></i>
                    </div>
                    <h3 class="font-semibold text-gray-800 mb-2">3. Community Wins</h3>
                    <p class="text-gray-600 text-sm">Reduce waste, fight hunger, help planet</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Add Food Modal -->
    <div id="addFoodModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">
                <i class="fas fa-plus-circle text-green-600 mr-2"></i>
                Share Food
            </h2>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Food Description</label>
                    <input type="text" id="foodDescription" placeholder="e.g., Fresh tomatoes" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Quantity (kg)</label>
                    <input type="number" id="foodQuantity" placeholder="15" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Food Type</label>
                    <select id="foodType" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                        <option value="vegetables">Vegetables</option>
                        <option value="fruits">Fruits</option>
                        <option value="grains">Grains</option>
                        <option value="tubers">Tubers</option>
                        <option value="legumes">Legumes</option>
                        <option value="prepared">Prepared Meals</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                    <input type="text" id="foodAddress" placeholder="Location details" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Contact Phone</label>
                    <input type="tel" id="foodPhone" placeholder="+254..." class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-2">Hours Until Expiry</label>
                    <input type="number" id="hoursExpiry" value="24" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                </div>
            </div>
            <div class="flex gap-4 mt-6">
                <button onclick="submitFood()" class="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition">
                    <i class="fas fa-check mr-2"></i>Submit
                </button>
                <button onclick="hideAddModal()" class="flex-1 bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition">
                    Cancel
                </button>
            </div>
        </div>
    </div>

    <script>
        // Load food listings
        async function loadFoodListings() {
            const status = document.getElementById('statusFilter').value;
            
            try {
                const response = await axios.get(\`/api/shared-food?status=\${status}\`);
                const foods = response.data.data;

                // Update stats
                const availableCount = foods.filter(f => f.status === 'available').length;
                const totalKg = foods.reduce((sum, f) => sum + f.item_kg, 0);
                document.getElementById('availableCount').textContent = availableCount;
                document.getElementById('totalShared').textContent = totalKg.toFixed(1) + ' kg';
                document.getElementById('co2Saved').textContent = (totalKg * 0.5).toFixed(1) + ' kg';
                document.getElementById('peopleHelped').textContent = foods.filter(f => f.status === 'completed').length;

                // Display listings
                const container = document.getElementById('foodListings');
                
                if (foods.length === 0) {
                    container.innerHTML = \`
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-inbox text-4xl mb-2"></i>
                            <p>No food listings found</p>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = foods.map(food => {
                    const statusColors = {
                        available: 'bg-green-100 text-green-700',
                        claimed: 'bg-blue-100 text-blue-700',
                        completed: 'bg-gray-100 text-gray-700'
                    };

                    const timeLeft = new Date(food.expiry_time) - new Date();
                    const hoursLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60)));

                    return \`
                        <div class="border-l-4 border-green-500 bg-gray-50 p-4 rounded-r-lg">
                            <div class="flex justify-between items-start mb-2">
                                <h3 class="font-semibold text-gray-800">\${food.description}</h3>
                                <span class="px-2 py-1 rounded text-xs font-semibold \${statusColors[food.status]}">
                                    \${food.status}
                                </span>
                            </div>
                            <div class="space-y-1 text-sm text-gray-600 mb-3">
                                <div><i class="fas fa-weight text-purple-500 mr-2"></i><strong>\${food.item_kg} kg</strong> - \${food.food_type || 'Mixed'}</div>
                                <div><i class="fas fa-user text-blue-500 mr-2"></i>\${food.donor_name}</div>
                                <div><i class="fas fa-map-marker-alt text-red-500 mr-2"></i>\${food.address || 'Location on map'}</div>
                                <div><i class="fas fa-clock text-orange-500 mr-2"></i>\${hoursLeft} hours left</div>
                            </div>
                            \${food.status === 'available' ? \`
                                <button onclick="claimFood(\${food.id})" class="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition text-sm font-semibold">
                                    <i class="fas fa-hand-paper mr-2"></i>Claim This Food
                                </button>
                            \` : ''}
                        </div>
                    \`;
                }).join('');
            } catch (error) {
                console.error('Error loading food listings:', error);
            }
        }

        // Filter change handler
        document.getElementById('statusFilter').addEventListener('change', loadFoodListings);

        function showAddModal() {
            document.getElementById('addFoodModal').classList.remove('hidden');
            document.getElementById('addFoodModal').classList.add('flex');
        }

        function hideAddModal() {
            document.getElementById('addFoodModal').classList.add('hidden');
            document.getElementById('addFoodModal').classList.remove('flex');
        }

        async function submitFood() {
            const description = document.getElementById('foodDescription').value;
            const quantity = document.getElementById('foodQuantity').value;
            const type = document.getElementById('foodType').value;
            const address = document.getElementById('foodAddress').value;
            const phone = document.getElementById('foodPhone').value;
            const hours = document.getElementById('hoursExpiry').value;

            if (!description || !quantity || !address || !phone) {
                alert('Please fill in all required fields');
                return;
            }

            try {
                // In production, get actual geolocation
                const mockLocations = [
                    { lat: -1.286389, lng: 36.817223, region: 'Nairobi' },
                    { lat: -1.292066, lng: 36.821946, region: 'Nairobi' },
                    { lat: 5.603717, lng: -0.186964, region: 'Accra' }
                ];
                const location = mockLocations[Math.floor(Math.random() * mockLocations.length)];

                await axios.post('/api/shared-food', {
                    donor_id: 1, // In production, get from auth
                    donor_name: 'Current User',
                    description: description,
                    item_kg: parseFloat(quantity),
                    food_type: type,
                    location_lat: location.lat,
                    location_lng: location.lng,
                    address: address,
                    contact_phone: phone,
                    hours_until_expiry: parseInt(hours)
                });

                alert('Food shared successfully! Thank you for helping the community.');
                hideAddModal();
                loadFoodListings();

                // Clear form
                document.getElementById('foodDescription').value = '';
                document.getElementById('foodQuantity').value = '';
                document.getElementById('foodAddress').value = '';
                document.getElementById('foodPhone').value = '';
            } catch (error) {
                console.error('Error sharing food:', error);
                alert('Error sharing food. Please try again.');
            }
        }

        async function claimFood(id) {
            if (!confirm('Do you want to claim this food donation?')) return;

            try {
                await axios.post(\`/api/shared-food/\${id}/claim\`, {
                    claimed_by: 1 // In production, get from auth
                });

                alert('Food claimed successfully! Contact the donor to arrange pickup.');
                loadFoodListings();
            } catch (error) {
                console.error('Error claiming food:', error);
                alert('Error claiming food. Please try again.');
            }
        }

        // Initial load
        loadFoodListings();
    </script>
</body>
</html>`
}

function renderEducationPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Education Hub - NutriCare</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <i class="fas fa-leaf text-green-600 text-2xl mr-2"></i>
                    <span class="text-2xl font-bold text-gray-800">NutriCare</span>
                </div>
                <div class="flex items-center space-x-8">
                    <a href="/" class="text-gray-700 hover:text-green-600">Home</a>
                    <a href="/dashboard" class="text-gray-700 hover:text-green-600">Dashboard</a>
                    <a href="/scanner" class="text-gray-700 hover:text-green-600">AI Scanner</a>
                    <a href="/food-map" class="text-gray-700 hover:text-green-600">Food Map</a>
                    <a href="/education" class="text-green-600 font-bold">Learn</a>
                </div>
            </div>
        </div>
    </nav>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Header -->
        <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-800 mb-2">
                <i class="fas fa-book-open text-blue-600 mr-2"></i>
                Education Hub
            </h1>
            <p class="text-gray-600">Learn about nutrition, sustainable farming, and climate-smart practices</p>
        </div>

        <!-- Category Filter -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div class="flex flex-wrap gap-3">
                <button onclick="filterByCategory('all')" class="category-btn active px-6 py-2 rounded-full font-semibold transition">
                    <i class="fas fa-globe mr-2"></i>All Topics
                </button>
                <button onclick="filterByCategory('nutrition')" class="category-btn px-6 py-2 rounded-full font-semibold transition">
                    <i class="fas fa-apple-alt mr-2"></i>Nutrition
                </button>
                <button onclick="filterByCategory('farming')" class="category-btn px-6 py-2 rounded-full font-semibold transition">
                    <i class="fas fa-tractor mr-2"></i>Farming
                </button>
                <button onclick="filterByCategory('climate')" class="category-btn px-6 py-2 rounded-full font-semibold transition">
                    <i class="fas fa-cloud-sun mr-2"></i>Climate
                </button>
                <button onclick="filterByCategory('sustainability')" class="category-btn px-6 py-2 rounded-full font-semibold transition">
                    <i class="fas fa-recycle mr-2"></i>Sustainability
                </button>
            </div>
        </div>

        <!-- Featured Tips -->
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-gray-800 mb-4">
                <i class="fas fa-star text-yellow-500 mr-2"></i>
                Featured Content
            </h2>
            <div id="featuredTips" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Featured tips will be loaded here -->
            </div>
        </div>

        <!-- All Tips -->
        <div>
            <h2 class="text-2xl font-bold text-gray-800 mb-4">
                <i class="fas fa-list text-green-600 mr-2"></i>
                All Articles
            </h2>
            <div id="allTips" class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- All tips will be loaded here -->
            </div>
        </div>

        <!-- SDG Information -->
        <div class="mt-12 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-8 border-2 border-blue-200">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">
                <i class="fas fa-globe-africa text-blue-600 mr-2"></i>
                Aligned with UN Sustainable Development Goals
            </h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div class="text-center">
                    <div class="w-16 h-16 bg-yellow-400 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-2xl font-bold">2</div>
                    <p class="text-sm font-semibold">Zero Hunger</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-green-400 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-2xl font-bold">3</div>
                    <p class="text-sm font-semibold">Good Health</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-orange-400 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-2xl font-bold">12</div>
                    <p class="text-sm font-semibold">Responsible Consumption</p>
                </div>
                <div class="text-center">
                    <div class="w-16 h-16 bg-blue-400 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-2xl font-bold">13</div>
                    <p class="text-sm font-semibold">Climate Action</p>
                </div>
            </div>
        </div>
    </div>

    <style>
        .category-btn {
            background-color: #f3f4f6;
            color: #4b5563;
        }
        .category-btn:hover {
            background-color: #e5e7eb;
        }
        .category-btn.active {
            background-color: #10b981;
            color: white;
        }
    </style>

    <script>
        let allTips = [];
        let currentCategory = 'all';

        async function loadEducationTips() {
            try {
                const response = await axios.get('/api/education-tips');
                allTips = response.data.data;
                displayTips();
            } catch (error) {
                console.error('Error loading education tips:', error);
            }
        }

        function displayTips() {
            const featured = allTips.filter(tip => tip.is_featured);
            const regular = allTips.filter(tip => !tip.is_featured);

            // Filter by category
            const filteredFeatured = currentCategory === 'all' 
                ? featured 
                : featured.filter(tip => tip.category === currentCategory);
            
            const filteredRegular = currentCategory === 'all' 
                ? regular 
                : regular.filter(tip => tip.category === currentCategory);

            // Display featured tips
            const featuredContainer = document.getElementById('featuredTips');
            featuredContainer.innerHTML = filteredFeatured.map(tip => {
                const categoryIcons = {
                    nutrition: 'fa-apple-alt',
                    farming: 'fa-tractor',
                    climate: 'fa-cloud-sun',
                    sustainability: 'fa-recycle'
                };

                const categoryColors = {
                    nutrition: 'from-purple-500 to-pink-500',
                    farming: 'from-green-500 to-teal-500',
                    climate: 'from-blue-500 to-indigo-500',
                    sustainability: 'from-orange-500 to-red-500'
                };

                return \`
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition cursor-pointer" onclick="viewTip(\${tip.id})">
                        <div class="bg-gradient-to-r \${categoryColors[tip.category]} p-6 text-white">
                            <div class="flex items-center justify-between mb-4">
                                <span class="px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-semibold">
                                    <i class="fas \${categoryIcons[tip.category]} mr-1"></i>
                                    \${tip.category}
                                </span>
                                <i class="fas fa-star text-yellow-300"></i>
                            </div>
                            <h3 class="text-2xl font-bold mb-2">\${tip.title}</h3>
                        </div>
                        <div class="p-6">
                            <p class="text-gray-600 mb-4">\${tip.content.substring(0, 150)}...</p>
                            <div class="flex items-center justify-between text-sm text-gray-500">
                                <div><i class="fas fa-eye mr-1"></i>\${tip.views} views</div>
                                <div class="text-green-600 font-semibold">Read More →</div>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');

            // Display regular tips
            const regularContainer = document.getElementById('allTips');
            regularContainer.innerHTML = filteredRegular.map(tip => {
                const categoryIcons = {
                    nutrition: 'fa-apple-alt',
                    farming: 'fa-tractor',
                    climate: 'fa-cloud-sun',
                    sustainability: 'fa-recycle'
                };

                const categoryColors = {
                    nutrition: 'border-purple-500',
                    farming: 'border-green-500',
                    climate: 'border-blue-500',
                    sustainability: 'border-orange-500'
                };

                return \`
                    <div class="bg-white rounded-xl shadow-lg p-6 border-t-4 \${categoryColors[tip.category]} hover:shadow-2xl transition cursor-pointer" onclick="viewTip(\${tip.id})">
                        <div class="mb-4">
                            <span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                                <i class="fas \${categoryIcons[tip.category]} mr-1"></i>
                                \${tip.category}
                            </span>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-3">\${tip.title}</h3>
                        <p class="text-gray-600 text-sm mb-4">\${tip.content.substring(0, 120)}...</p>
                        <div class="flex items-center justify-between text-xs text-gray-500">
                            <div><i class="fas fa-eye mr-1"></i>\${tip.views}</div>
                            <div class="text-green-600 font-semibold">Read More →</div>
                        </div>
                    </div>
                \`;
            }).join('');

            if (filteredFeatured.length === 0 && filteredRegular.length === 0) {
                featuredContainer.innerHTML = '<p class="text-gray-500 col-span-2 text-center py-8">No content found for this category</p>';
                regularContainer.innerHTML = '';
            }
        }

        function filterByCategory(category) {
            currentCategory = category;
            
            // Update button styles
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            displayTips();
        }

        async function viewTip(id) {
            try {
                const response = await axios.get(\`/api/education-tips/\${id}\`);
                const tip = response.data.data;
                
                alert(\`\${tip.title}\\n\\n\${tip.content}\\n\\nViews: \${tip.views + 1}\`);
                
                // Reload to reflect updated view count
                loadEducationTips();
            } catch (error) {
                console.error('Error viewing tip:', error);
            }
        }

        // Initial load
        loadEducationTips();
    </script>
</body>
</html>`
}

export default app
