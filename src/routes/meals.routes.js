const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

const {
  calculateMealSummary,
} = require('../utils/mealSummary');

const {
  recommendBestFoodPair,
} = require('../utils/mealRecommendations');

router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { herdId, foodId, amountG, date } = req.body;
  

  if (!herdId || !foodId || !amountG || !date) {
    return res.status(400).json({
      message: 'Herd ID, food ID, amount and date are required',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      message: 'Date must use YYYY-MM-DD format',
    });
  }

  if (!Number.isInteger(Number(amountG)) || Number(amountG) < 1) {
    return res.status(400).json({
      message: 'Amount must be a whole number greater than 0',
    });
  }

  try {
    const [herds] = await pool.query(
      `
      SELECT id
      FROM herds
      WHERE id = ?
      AND user_id = ?
      `,
      [herdId, userId]
    );

    if (herds.length === 0) {
      return res.status(404).json({
        message: 'Herd not found',
      });
    }

    const [foods] = await pool.query(
      `
      SELECT id
      FROM foods
      WHERE id = ?
      `,
      [foodId]
    );

    if (foods.length === 0) {
      return res.status(404).json({
        message: 'Food not found',
      });
    }

    const [existingMeals] = await pool.query(
      `
      SELECT id
      FROM meals
      WHERE herd_id = ?
      AND meal_date = ?
      `,
      [herdId, date]
    );

    let mealId;

    if (existingMeals.length > 0) {
      mealId = existingMeals[0].id;
    } else {
      const [mealResult] = await pool.query(
        `
        INSERT INTO meals
        (herd_id, meal_date)
        VALUES (?, ?)
        `,
        [herdId, date]
      );

      mealId = mealResult.insertId;
    }

    const [existingItems] = await pool.query(
      `
      SELECT id, amount_g
      FROM meal_items
      WHERE meal_id = ?
      AND food_id = ?
      `,
      [mealId, foodId]
    );

    if (existingItems.length > 0) {
      const existingItem = existingItems[0];
      const newAmountG = existingItem.amount_g + Number(amountG);

      await pool.query(
        `
        UPDATE meal_items
        SET amount_g = ?
        WHERE id = ?
        `,
        [newAmountG, existingItem.id]
      );

      return res.status(200).json({
        message: 'Food amount updated',
        mealId,
        mealItemId: existingItem.id,
        amountG: newAmountG,
      });
    }

    const [itemResult] = await pool.query(
      `
      INSERT INTO meal_items
      (meal_id, food_id, amount_g)
      VALUES (?, ?, ?)
      `,
      [mealId, foodId, Number(amountG)]
    );

    return res.status(201).json({
      message: 'Food added to meal',
      mealId,
      mealItemId: itemResult.insertId,
      amountG: Number(amountG),
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to add food to meal',
      error: error.message,
    });
  }
});

router.get('/statistics', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { herdId, days } = req.query;
  const periodDays = Number(days);

  
  if (!herdId || !days) {
    return res.status(400).json({
      message: 'Herd ID and days are required',
    });
  }
  if (!Number.isInteger(periodDays) || periodDays < 1) {
    return res.status(400).json({
      message: 'Days must be a positive whole number',
    });
  }

  try {
    const [herds] = await pool.query(
      `
      SELECT id
      FROM herds
      WHERE id = ?
      AND user_id = ?
      `,
      [herdId, userId]
    );

    const [weightRows] = await pool.query(
      `
      SELECT COALESCE(SUM(weight_g), 0) AS totalWeightG
      FROM guinea_pigs
      WHERE herd_id = ?
      `,
      [herdId]
    );

    const totalWeightG = Number(weightRows[0].totalWeightG);

    const daysBack = periodDays - 1;

    const [mealRows] = await pool.query(
      `
      SELECT
        meals.id AS meal_id,
        meals.meal_date,

        meal_items.id AS meal_item_id,
        meal_items.amount_g,

        foods.id AS food_id,
        foods.name,
        foods.vitc,
        foods.calcium,
        foods.phosphorus,
        foods.sugar,
        foods.high_oxalates

      FROM meals

      JOIN meal_items
        ON meals.id = meal_items.meal_id

      JOIN foods
        ON meal_items.food_id = foods.id

      WHERE meals.herd_id = ?
      AND meals.meal_date BETWEEN
        DATE_SUB(CURDATE(), INTERVAL ${daysBack} DAY)
        AND CURDATE()

      ORDER BY meals.meal_date ASC, foods.name ASC
      `,
      [herdId]
    );
    const mealsByDate = {};

    mealRows.forEach((row) => {
      if (!mealsByDate[row.meal_date]) {
        mealsByDate[row.meal_date] = [];
      }

      mealsByDate[row.meal_date].push(row);
    });

    const summaries = [];

    Object.values(mealsByDate).forEach((foods) => {
      const summary = calculateMealSummary(
        foods,
        totalWeightG
      );

      summaries.push(summary);
    });

    const totals = summaries.reduce(
      (acc, summary) => {
        acc.vitaminC += summary.vitaminC;
        acc.calcium += summary.calcium;
        acc.calciumPhosphorusRatio +=
          summary.calciumPhosphorusRatio;

        if (summary.hasHighOxalates) {
          acc.highOxalateDays += 1;
        }

        return acc;
      },
      {
        vitaminC: 0,
        calcium: 0,
        calciumPhosphorusRatio: 0,
        highOxalateDays: 0,
      }
    );

    const mealsRecorded = summaries.length;

    const averages = {
      vitaminC:
        mealsRecorded === 0
          ? 0
          : Number((totals.vitaminC / mealsRecorded).toFixed(2)),

      calcium:
        mealsRecorded === 0
          ? 0
          : Number((totals.calcium / mealsRecorded).toFixed(2)),

      calciumPhosphorusRatio:
        mealsRecorded === 0
          ? 0
          : Number(
              (
                totals.calciumPhosphorusRatio / mealsRecorded
              ).toFixed(2)
            ),
    };

    if (herds.length === 0) {
      return res.status(404).json({
        message: 'Herd not found',
      });
    }

    return res.json({
      periodDays,
      mealsRecorded,
      averages,
      highOxalateDays: totals.highOxalateDays,
      recommendations: [],
    });
    

  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch statistics',
      error: error.message,
    });
  }
});

router.get('/day', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { herdId, date } = req.query;

  if (!herdId || !date) {
    return res.status(400).json({
      message: 'Herd ID and date are required',
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      message: 'Date must use YYYY-MM-DD format',
    });
  }

  try {
    const [herds] = await pool.query(
      `
      SELECT id
      FROM herds
      WHERE id = ?
      AND user_id = ?
      `,
      [herdId, userId]
    );

    if (herds.length === 0) {
      return res.status(404).json({
        message: 'Herd not found',
      });
    }

    const [weightRows] = await pool.query(
      `
      SELECT COALESCE(SUM(weight_g), 0) AS totalWeightG
      FROM guinea_pigs
      WHERE herd_id = ?
      `,
      [herdId]
    );

    const totalWeightG = Number(weightRows[0].totalWeightG);
    const totalWeightKg = totalWeightG / 1000;

    const vitaminCGoalMin = totalWeightKg * 20;
    const vitaminCGoalMax = totalWeightKg * 50;

    const calciumGoalMin = totalWeightKg * 20;
    const calciumGoalMax = totalWeightKg * 50;

    const [meals] = await pool.query(
      `
      SELECT id
      FROM meals
      WHERE herd_id = ?
      AND meal_date = ?
      `,
      [herdId, date]
    );

    if (meals.length === 0) {
      return res.json({
        items: [],
        summary: {
          vitaminC: 0,
          calcium: 0,
          phosphorus: 0,
          calciumPhosphorusRatio: 0,
          sugar: 0,
          hasHighOxalates: false,
          allGoalsInRange: false,

          totalWeightG,
          totalWeightKg: Number(totalWeightKg.toFixed(2)),
          vitaminCGoalMin: Number(vitaminCGoalMin.toFixed(2)),
          vitaminCGoalMax: Number(vitaminCGoalMax.toFixed(2)),
          calciumGoalMin: Number(calciumGoalMin.toFixed(2)),
          calciumGoalMax: Number(calciumGoalMax.toFixed(2)),
        },
      });
    }

    const mealId = meals[0].id;

    const [foods] = await pool.query(
      `
      SELECT
        meal_items.id,
        foods.id AS food_id,
        foods.name,
        meal_items.amount_g,

        foods.vitc,
        foods.calcium,
        foods.phosphorus,
        foods.sugar,
        foods.high_oxalates

      FROM meal_items

      JOIN foods
        ON meal_items.food_id = foods.id

      WHERE meal_items.meal_id = ?

      ORDER BY foods.name
      `,
      [mealId]
    );

    const summary = calculateMealSummary(
      foods,
      totalWeightG
    );


    return res.json({
      items: foods,
      summary,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch meal',
      error: error.message,
    });
  }
});

router.put('/item/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { amountG } = req.body;

  if (!Number.isInteger(Number(amountG)) || Number(amountG) < 1) {
    return res.status(400).json({
      message: 'Amount must be a whole number greater than 0',
    });
  }

  try {
    const [items] = await pool.query(
      `
      SELECT
        meal_items.id
      FROM meal_items
      JOIN meals
        ON meal_items.meal_id = meals.id
      JOIN herds
        ON meals.herd_id = herds.id
      WHERE meal_items.id = ?
      AND herds.user_id = ?
      `,
      [id, userId]
    );

    if (items.length === 0) {
      return res.status(404).json({
        message: 'Meal item not found',
      });
    }

    await pool.query(
      `
      UPDATE meal_items
      SET amount_g = ?
      WHERE id = ?
      `,
      [Number(amountG), id]
    );

    return res.json({
      message: 'Meal item updated successfully',
      mealItemId: Number(id),
      amountG: Number(amountG),
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to update meal item',
      error: error.message,
    });
  }
});

router.delete('/item/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const [items] = await pool.query(
      `
      SELECT
        meal_items.id,
        meal_items.meal_id
      FROM meal_items
      JOIN meals
        ON meal_items.meal_id = meals.id
      JOIN herds
        ON meals.herd_id = herds.id
      WHERE meal_items.id = ?
      AND herds.user_id = ?
      `,
      [id, userId]
    );

    if (items.length === 0) {
      return res.status(404).json({
        message: 'Meal item not found',
      });
    }

    const mealId = items[0].meal_id;

    await pool.query(
      `
      DELETE FROM meal_items
      WHERE id = ?
      `,
      [id]
    );

    const [remainingItems] = await pool.query(
      `
      SELECT id
      FROM meal_items
      WHERE meal_id = ?
      `,
      [mealId]
    );

    if (remainingItems.length === 0) {
      await pool.query(
        `
        DELETE FROM meals
        WHERE id = ?
        `,
        [mealId]
      );
    }

    return res.json({
      message: 'Meal item deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to delete meal item',
      error: error.message,
    });
  }
});

router.get(
  '/recommendations',
  authMiddleware,
  async (req, res) => {
    const userId = req.user.id;
    const { herdId, date } = req.query;

    if (!herdId || !date) {
      return res.status(400).json({
        message: 'Herd ID and date are required',
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        message: 'Date must use YYYY-MM-DD format',
      });
    }

    try {
      const [herds] = await pool.query(
  `
  SELECT id
  FROM herds
  WHERE id = ?
  AND user_id = ?
  `,
  [herdId, userId]
);

if (herds.length === 0) {
  return res.status(404).json({
    message: 'Herd not found',
  });
}

const [weightRows] = await pool.query(
  `
  SELECT COALESCE(SUM(weight_g), 0) AS totalWeightG
  FROM guinea_pigs
  WHERE herd_id = ?
  `,
  [herdId]
);

const totalWeightG = Number(
  weightRows[0].totalWeightG
);

const [meals] = await pool.query(
  `
  SELECT id
  FROM meals
  WHERE herd_id = ?
  AND meal_date = ?
  `,
  [herdId, date]
);

let currentFoods = [];

if (meals.length > 0) {
  const mealId = meals[0].id;

  const [mealFoods] = await pool.query(
    `
    SELECT
      foods.id,
      foods.name,
      meal_items.amount_g,
      foods.vitc,
      foods.calcium,
      foods.phosphorus,
      foods.sugar,
      foods.high_oxalates
    FROM meal_items
    JOIN foods
      ON meal_items.food_id = foods.id
    WHERE meal_items.meal_id = ?
    ORDER BY foods.name
    `,
    [mealId]
  );

  currentFoods = mealFoods;
}

const [availableFoods] = await pool.query(
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

const recommendations = recommendBestFoodPair({
  currentFoods,
  availableFoods,
  totalWeightG,
});

const formattedRecommendations = recommendations.map(
  (recommendation, index) => ({
    title: index === 0 ? 'Best Match' : 'Alternative',
    foods: recommendation.suggestedFoods.map((food) => ({
      id: food.id,
      name: food.name,
      amountG: food.amount_g,
    })),
    allGoalsInRange: recommendation.allGoalsInRange,
    score: recommendation.score,
  })
);

return res.json({
  recommendations: formattedRecommendations,
});

    } catch (error) {
      res.status(500).json({
        message: 'Failed to generate recommendations',
        error: error.message,
      });
    }
  }
);

module.exports = router;