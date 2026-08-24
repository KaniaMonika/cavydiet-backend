const authMiddleware = require('../middleware/auth.middleware');
const express = require('express');
const pool = require('../db');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDirectory = path.join(
  __dirname,
  '../uploads/piggies'
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname);

    const fileName = [
      'piggy',
      req.params.id,
      Date.now(),
    ].join('-');

    callback(null, `${fileName}${extension}`);
  },
});

const imageFileFilter = (req, file, callback) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return callback(
      new Error('Only JPG, PNG and WEBP images are allowed.')
    );
  }

  callback(null, true);
};

const uploadPiggyImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { herdId, name, sex, weightG } = req.body;
    const userId = req.user.id;

    if (!herdId || !name || !name.trim() || !weightG) {
      return res.status(400).json({
        message: 'Herd ID, name and weight are required',
      });
    }

    if (!Number.isInteger(Number(weightG)) || Number(weightG) < 1) {
      return res.status(400).json({
        message: 'Weight must be a whole number greater than 0',
      });
    }

    if (name.trim().length > 50) {
      return res.status(400).json({
        message: 'Name must be 50 characters or less',
      });
    }

    if (!['boar', 'sow', 'unknown'].includes(sex)) {
      return res.status(400).json({
        message: 'Invalid sex value',
      });
    }

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

    const [existingPiggies] = await pool.query(
      `
      SELECT COUNT(*) AS piggyCount
      FROM guinea_pigs
      WHERE herd_id = ?
      `,
      [herdId]
    );

    if (existingPiggies[0].piggyCount >= 15) {
      return res.status(400).json({
        message: 'You can create up to 15 piggies in one herd only',
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO guinea_pigs
      (herd_id, name, sex, weight_g)
      VALUES (?, ?, ?, ?)
      `,
      [herdId, name.trim(), sex, Number(weightG)]
    );

    res.status(201).json({
      message: 'Piggy created',
      piggyId: result.insertId,
    });
    } catch (error) {
      console.error('Create piggy error:', error);

      return res.status(500).json({
        message: 'Failed to create piggy',
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
      JOIN herds h ON gp.herd_id = h.id
      WHERE gp.id = ?
        AND h.user_id = ?
      `,
      [id, userId]
    );

    if (piggies.length === 0) {
      return res.status(404).json({
        message: 'Piggy not found',
      });
    }

    const photoUrl = piggies[0].photo_url;

    const [result] = await pool.query(
      `
      DELETE gp
      FROM guinea_pigs gp
      JOIN herds h ON gp.herd_id = h.id
      WHERE gp.id = ?
        AND h.user_id = ?
      `,
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Piggy not found',
      });
    }

    if (photoUrl?.startsWith('/uploads/piggies/')) {
      const fileName = path.basename(photoUrl);
      const filePath = path.join(uploadDirectory, fileName);

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.error(
            'Failed to remove piggy image:',
            cleanupError
          );
        }
      }
    }

    return res.json({
      message: 'Piggy deleted successfully',
    });
  } catch (error) {
    console.error('Delete piggy error:', error);

    return res.status(500).json({
      message: 'Failed to delete piggy',
    });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, sex } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({
      message: 'Name is required',
    });
  }

  if (name.trim().length > 50) {
    return res.status(400).json({
      message: 'Name must be 50 characters or less',
    });
  }

  if (!['boar', 'sow', 'unknown'].includes(sex)) {
    return res.status(400).json({
      message: 'Invalid sex value',
    });
  }

  try {
    const [result] = await pool.query(
      `
      UPDATE guinea_pigs gp
      JOIN herds h ON gp.herd_id = h.id
      SET
        gp.name = ?,
        gp.sex = ?
      WHERE gp.id = ?
        AND h.user_id = ?
      `,
      [name.trim(), sex, id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Piggy not found',
      });
    }

    return res.json({
      message: 'Piggy updated successfully',
    });
  } catch (error) {
    console.error('Update piggy error:', error);

    return res.status(500).json({
      message: 'Failed to update piggy',
    });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [piggies] = await pool.query(
      `
      SELECT
        guinea_pigs.id,
        guinea_pigs.name,
        guinea_pigs.sex,
        guinea_pigs.weight_g,
        guinea_pigs.herd_id,
        guinea_pigs.photo_url,
        CONCAT(
          'Herd ',
          (
            SELECT COUNT(*)
            FROM herds AS h2
            WHERE h2.user_id = herds.user_id
              AND h2.id <= herds.id
          )
        ) AS herd_name
      FROM guinea_pigs
      JOIN herds
        ON guinea_pigs.herd_id = herds.id
      WHERE herds.user_id = ?
      ORDER BY herds.id, guinea_pigs.id
      `,
      [userId]
    );
    res.json(piggies);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch piggies',
      error: error.message,
    });
  }
});

router.get('/:id/health-checks', authMiddleware, async (req, res) => {
  try {
    const piggyId = req.params.id;
    const userId = req.user.id;

    const [piggies] = await pool.query(
      `
      SELECT guinea_pigs.id
      FROM guinea_pigs
      JOIN herds
        ON guinea_pigs.herd_id = herds.id
      WHERE guinea_pigs.id = ?
        AND herds.user_id = ?
      `,
      [piggyId, userId]
    );

    if (piggies.length === 0) {
      return res.status(404).json({
        message: 'Piggy not found',
      });
    }

    const [healthChecks] = await pool.query(
      `
      SELECT
        id,
        guinea_pig_id,
        check_date,
        weight_g,
        concerns,
        created_at
      FROM health_check
      WHERE guinea_pig_id = ?
      ORDER BY check_date DESC, id DESC
      `,
      [piggyId]
    );

    res.json(healthChecks);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch health checks',
      error: error.message,
    });
  }
});

router.post('/:id/health-checks', authMiddleware, async (req, res) => {
  let connection;

  try {
    const piggyId = req.params.id;
    const userId = req.user.id;
    const { weight_g, concerns } = req.body;

    if (!weight_g) {
      return res.status(400).json({
        message: 'Weight is required',
      });
    }

    if (!Number.isInteger(Number(weight_g)) || Number(weight_g) < 1) {
      return res.status(400).json({
        message: 'Weight must be a whole number greater than 0',
      });
    }

    const [piggies] = await pool.query(
      `
      SELECT guinea_pigs.id
      FROM guinea_pigs
      JOIN herds
        ON guinea_pigs.herd_id = herds.id
      WHERE guinea_pigs.id = ?
        AND herds.user_id = ?
      `,
      [piggyId, userId]
    );

    if (piggies.length === 0) {
      return res.status(404).json({
        message: 'Piggy not found',
      });
    }

    connection = await pool.getConnection();

    await connection.beginTransaction();

    const [result] = await connection.query(
      `
      INSERT INTO health_check (
        guinea_pig_id,
        check_date,
        weight_g,
        concerns
      )
      VALUES (?, CURDATE(), ?, ?)
      `,
      [
        piggyId,
        weight_g,
        concerns?.trim() || null,
      ]
    );

    await connection.query(
      `
      UPDATE guinea_pigs
      SET weight_g = ?
      WHERE id = ?
      `,
      [weight_g, piggyId]
    );

    await connection.commit();

    connection.release();
    connection = null;

    res.status(201).json({
      message: 'Health check saved',
      healthCheck: {
        id: result.insertId,
        guinea_pig_id: Number(piggyId),
        check_date: new Date().toISOString().split('T')[0],
        weight_g: Number(weight_g),
        concerns: concerns?.trim() || null,
      },
    });
    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }

      console.error('Save health check error:', error);

      return res.status(500).json({
        message: 'Failed to save health check',
      });
    }
});

router.post(
  '/:id/image',
  authMiddleware,
  uploadPiggyImage.single('image'),
  async (req, res) => {
    try {
      const piggyId = req.params.id;
      const userId = req.user.id;

      const [piggies] = await pool.query(
        `
        SELECT
          guinea_pigs.id,
          guinea_pigs.photo_url
        FROM guinea_pigs
        JOIN herds
          ON guinea_pigs.herd_id = herds.id
        WHERE guinea_pigs.id = ?
          AND herds.user_id = ?
        `,
        [piggyId, userId]
      );

      if (piggies.length === 0) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(404).json({
          message: 'Piggy not found',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: 'Image is required',
        });
      }

      const oldPhotoUrl = piggies[0].photo_url;

      const photoUrl = `/uploads/piggies/${req.file.filename}`;

      await pool.query(
        `
        UPDATE guinea_pigs
        SET photo_url = ?
        WHERE id = ?
        `,
        [photoUrl, piggyId]
      );

      if (oldPhotoUrl?.startsWith('/uploads/piggies/')) {
        const oldFileName = path.basename(oldPhotoUrl);
        const oldFilePath = path.join(uploadDirectory, oldFileName);

        if (
          oldFileName !== req.file.filename &&
          fs.existsSync(oldFilePath)
        ) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (cleanupError) {
            console.error(
              'Failed to remove old piggy image:',
              cleanupError
            );
          }
        }
      }

      res.status(201).json({
        message: 'Image uploaded',
        photo_url: photoUrl,
      });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      console.error('Upload piggy image error:', error);

      return res.status(500).json({
        message: 'Failed to upload image',
      });
    }
  }
);

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [piggies] = await pool.query(
      `
      SELECT
        guinea_pigs.id,
        guinea_pigs.name,
        guinea_pigs.sex,
        guinea_pigs.weight_g,
        guinea_pigs.herd_id,
        guinea_pigs.photo_url,
        CONCAT(
          'Herd ',
          (
            SELECT COUNT(*)
            FROM herds AS h2
            WHERE h2.user_id = herds.user_id
              AND h2.id <= herds.id
          )
        ) AS herd_name
      FROM guinea_pigs
      JOIN herds
        ON guinea_pigs.herd_id = herds.id
      WHERE guinea_pigs.id = ?
      AND herds.user_id = ?
      `,
      [id, userId]
    );

    if (piggies.length === 0) {
      return res.status(404).json({
        message: 'Piggy not found',
      });
    }

    res.json(piggies[0]);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch piggy',
      error: error.message,
    });
  }
});

module.exports = router;