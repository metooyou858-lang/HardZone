const express = require('express');

const {
  createCompetitionRegistration,
} = require('../services/competition-registration');
const { getCompetitionConfig } = require('../services/competition-events');
const {
  getCompetitionPaymentSummary,
  handleTbankCompetitionNotification,
  startCompetitionPayment,
} = require('../services/competition-payment');
const logger = require('../services/logger');

const router = express.Router();

router.get('/results', async (req,res,next) => {
  res.set('Cache-Control','no-store, private, max-age=0');
  try {
    const config=await getCompetitionConfig(String(req.query.event || '') || undefined);
    return res.json({success:true,data:await require('../services/competition-results').publicResults(config.event_key)});
  } catch(error) { if(error.statusCode) return res.status(error.statusCode).json({success:false,error:error.message}); return next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ success: true, data: await getCompetitionConfig(String(req.query.event || '') || undefined) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, error: error.message });
    return next(error);
  }
});

router.post('/registrations', async (req, res, next) => {
  try {
    if (String(req.body?.website || '').trim()) {
      return res.status(201).json({ success: true, data: null });
    }
    const eventKey = String(req.query.event || '') || undefined;
    const registration = await createCompetitionRegistration(req.body, eventKey);
    const competition = await getCompetitionConfig(eventKey);
    if (!competition.payment_enabled) {
      return res.status(201).json({ success: true, data: { registration, payment_url: null } });
    }

    try {
      const payment = await startCompetitionPayment(registration.public_token);
      return res.status(201).json({
        success: true,
        data: {
          registration,
          payment_url: payment.payment_url,
          already_paid: payment.already_paid,
        },
      });
    } catch (paymentError) {
      return res.status(201).json({
        success: true,
        data: {
          registration,
          payment_url: null,
          payment_error: paymentError.message,
        },
      });
    }
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    return next(error);
  }
});

router.post('/registrations/:publicToken/payment', async (req, res, next) => {
  try {
    const payment = await startCompetitionPayment(req.params.publicToken);
    return res.json({ success: true, data: payment });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    return next(error);
  }
});

router.get('/registrations/:publicToken/payment', async (req, res, next) => {
  try {
    const summary = await getCompetitionPaymentSummary(req.params.publicToken, {
      sync: String(req.query.sync || '') === '1',
    });
    return res.json({ success: true, data: summary });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    return next(error);
  }
});

router.post('/payments/tbank/notification', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const result = await handleTbankCompetitionNotification(req.body || {});
    logger.info('competition-payment-notification', {
      known: result.known,
      registrationId: result.registrationId || null,
      paymentStatus: result.paymentStatus || null,
    });
    return res.type('text/plain').send('OK');
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).type('text/plain').send('ERROR');
    }
    return next(error);
  }
});

module.exports = router;
