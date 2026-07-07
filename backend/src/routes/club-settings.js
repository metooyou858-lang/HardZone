const express = require('express');

const authMiddleware = require('../middleware/auth');
const { getClubContacts, updateClubContacts } = require('../services/club-settings');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireClubSettingsManage = authMiddleware.requireRole('owner', 'admin');

router.get('/contacts', requireClubSettingsManage, async (_req, res) => {
  try {
    const contacts = await getClubContacts();
    res.json({ success: true, data: contacts });
  } catch (error) {
    sendInternalError(res, error, { route: 'club_settings.contacts.get' });
  }
});

router.patch('/contacts', requireClubSettingsManage, async (req, res) => {
  try {
    const contacts = await updateClubContacts(req.body || {});
    res.json({ success: true, data: contacts });
  } catch (error) {
    sendInternalError(res, error, { route: 'club_settings.contacts.update' });
  }
});

module.exports = router;
