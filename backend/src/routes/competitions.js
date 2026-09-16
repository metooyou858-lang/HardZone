const express = require('express');

const {
  listCompetitionRegistrations,
  updateCompetitionRegistrationStatus,
} = require('../services/competition-registration');
const { getCompetitionConfig, listCompetitionEvents, createCompetitionEvent, updateCompetitionEvent } = require('../services/competition-events');

const router = express.Router();

router.get('/events', async (_req, res, next) => {
  try { return res.json({success:true, data:await listCompetitionEvents()}); } catch(error) { return next(error); }
});

router.post('/events', async (req, res, next) => {
  try { return res.status(201).json({success:true, data:await createCompetitionEvent(req.body)}); }
  catch(error) {
    if(error.statusCode) return res.status(error.statusCode).json({success:false,error:error.message});
    return next(error);
  }
});

router.patch('/events/:eventKey', async (req, res, next) => {
  try { return res.json({success:true, data:await updateCompetitionEvent(req.params.eventKey, req.body)}); }
  catch(error) {
    if(error.statusCode) return res.status(error.statusCode).json({success:false,error:error.message});
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const competition = await getCompetitionConfig(String(req.query.event || '') || undefined);
    const registrations = await listCompetitionRegistrations(undefined, competition.event_key);
    return res.json({
      success: true,
      data: {
        competition,
        registrations,
      },
    });
  } catch (error) {
    if(error.statusCode) return res.status(error.statusCode).json({success:false,error:error.message});
    return next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const registrations = await updateCompetitionRegistrationStatus(
      req.params.id,
      String(req.body?.status || '').trim(),
      String(req.query.event || '') || undefined
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
