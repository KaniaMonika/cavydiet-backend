const express = require('express');
const cors = require('cors');
const foodsRoutes = require('./routes/foods.routes');
const authRoutes = require('./routes/auth.routes');
const herdsRoutes = require('./routes/herds.routes');
const guineaPigsRoutes = require('./routes/guineaPigs.routes');
const mealsRoutes = require('./routes/meals.routes');
const path = require('path');

const app = express();

// Enable CORS, so the frontend can communicate with the backend
app.use(cors());

// Parse incoming JSON requests automatically
app.use(express.json());

// Register routes for food-related endpoints
app.use('/foods', foodsRoutes);
app.use('/auth', authRoutes);
app.use('/herds', herdsRoutes);
app.use('/guinea-pigs', guineaPigsRoutes);
app.use('/meals', mealsRoutes);

/**
 * Root endpoint
 * Used to check if the server is running
 */
app.get('/', (req, res) => {
  res.send('CavyDiet backend is running');
});

/**
 * Database connection test endpoint
 * Checks if the app can connect to MySQL
 */


app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

// Use the PORT environment variable if available,
// otherwise default to port 3000
const PORT = process.env.PORT || 3000;

//Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

