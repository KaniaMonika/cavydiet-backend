const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [foods] = await pool.query(
      `
      SELECT
        id,
        name,
        vitc,
        calcium,
        phosphorus,
        sugar,
        high_oxalates
      FROM foods
      ORDER BY name
      `
    );

    res.json(foods);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch foods',
    });
  }
});

module.exports = router;