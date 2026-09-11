const express = require('express');

const {
  getCompetitionPublicConfig,
  listCompetitionRegistrations,
  updateCompetitionRegistrationStatus,
} = require('../services/competition-registration');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const registrations = await listCompetitionRegistrations();
    return res.json({
      success: true,
      data: {
        competition: getCompetitionPublicConfig(),
        registrations,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const registrations = await updateCompetitionRegistrationStatus(
      req.params.id,
      String(req.body?.status || '').trim()
    );
    return res.json({ success: true, data: registrations });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    return next(error);
  }
});

module.exports = router;
