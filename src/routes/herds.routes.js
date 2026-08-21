const authMiddleware = require('../middleware/auth.middleware');
const express = require('express');
const pool = require('../db');

const router = express.Router();

const fs = require('fs');
const path = require('path');

const uploadDirectory = path.join(
  __dirname,
  '../uploads/piggies'
);

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { herdSize } = req.body;

    if (!Number.isInteger(herdSize)) {
      return res.status(400).json({
        message: 'Herd size must be a whole number',
      });
    }

    if (!herdSize) {
      return res.status(400).json({
        message: 'Herd size is required',
      });
    }

    if (Number(herdSize) < 2) {
      return res.status(400).json({
        message: 'Herd size must be at least 2',
      });
    }

    if (Number(herdSize) > 15) {
      return res.status(400).json({
        message: 'You can create up to 15 piggies in one herd only',
      });
    }

    const [existingHerds] = await pool.query(
      `
      SELECT COUNT(*) AS herdCount
      FROM herds
      WHERE user_id = ?
      `,
      [userId]
    );

    if (existingHerds[0].herdCount >= 2) {
      return res.status(400).json({
        message: 'You can create up to 2 herds only',
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO herds
      (user_id, herd_size)
      VALUES (?, ?)
      `,
      [userId, herdSize]
    );

    res.status(201).json({
      message: 'Herd created',
      herdId: result.insertId,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to create herd',
      error: error.message,
    });
  }
});

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [herds] = await pool.query(
      `
      SELECT *
      FROM herds
      WHERE user_id = ?
      ORDER BY id
      `,
      [userId]
    );

    for (const herd of herds) {
      const [piggies] = await pool.query(
        `
        SELECT
          id,
          name,
          sex,
          weight_g,
          photo_url
        FROM guinea_pigs
        WHERE herd_id = ?
        ORDER BY id
        `,
        [herd.id]
      );

      herd.piggies = piggies;
    }

    res.json(herds);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch herds',
      error: error.message,
    });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const [herds] = await pool.query(
      `
      SELECT *
      FROM herds
      WHERE id = ?
      AND user_id = ?
      `,
      [id, userId]
    );

    if (herds.length === 0) {
      return res.status(404).json({
        message: 'Herd not found',
      });
    }

    const herd = herds[0];

    const [piggies] = await pool.query(
      `
      SELECT
        id,
        name,
        sex,
        weight_g,
        photo_url
      FROM guinea_pigs
      WHERE herd_id = ?
      ORDER BY id
      `,
      [herd.id]
    );

    herd.piggies = piggies;

    res.json(herd);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch herd',
      error: error.message,
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [piggies] = await pool.query(
      `
      SELECT gp.photo_url
      FROM guinea_pigs gp
      JOIN herds h
        ON gp.herd_id = h.id
      WHERE h.id = ?
        AND h.user_id = ?
        AND gp.photo_url IS NOT NULL
      `,
      [id, userId]
    );

    const [result] = await pool.query(
      `
      DELETE FROM herds
      WHERE id = ?
        AND user_id = ?
      `,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Herd not found',
      });
    }

    for (const piggy of piggies) {
      const photoUrl = piggy.photo_url;

      if (photoUrl?.startsWith('/uploads/piggies/')) {
        const fileName = path.basename(photoUrl);
        const filePath = path.join(
          uploadDirectory,
          fileName
        );

        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (cleanupError) {
            console.error(
              'Failed to remove piggy image after herd deletion:',
              cleanupError
            );
          }
        }
      }
    }

    return res.json({
      message: 'Herd deleted successfully',
    });
  } catch (error) {
    console.error('Delete herd error:', error);

    return res.status(500).json({
      message: 'Failed to delete herd',
    });
  }
});

module.exports = router;