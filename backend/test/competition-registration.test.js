const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  normalizeCompetitionRegistration,
  registrationsMatch,
} = require('../src/services/competition-registration');

function validRegistration(overrides = {}) {
  return {
    team_name: ' Стальные нервы ',
    team_email: ' TEAM@example.ru ',
    category: 'amateur',
    male_name: ' Алексей Смирнов ',
    male_phone: '+7 (999) 111-22-33',
    female_name: ' Анна Смирнова ',
    female_phone: '8 999 222 33 44',
    terms_accepted: true,
    personal_data_accepted: true,
    ...overrides,
  };
}

test('competition registration normalizes names and Russian phones', () => {
  const registration = normalizeCompetitionRegistration(validRegistration());

  assert.equal(registration.team_name, 'Стальные нервы');
  assert.equal(registration.male_name, 'Алексей Смирнов');
  assert.equal(registration.male_phone_normalized, '79991112233');
  assert.equal(registration.female_phone_normalized, '79992223344');
});

test('competition registration accepts only approved categories', () => {
  assert.throws(
    () => normalizeCompetitionRegistration(validRegistration({ category: 'elite' })),
    /Выберите категорию команды/
  );
});

test('competition registration requires event terms consent', () => {
  assert.throws(
    () => normalizeCompetitionRegistration(validRegistration({ terms_accepted: false })),
    /согласие с условиями/
  );
});

test('competition registration requires personal data consent', () => {
  assert.throws(
    () => normalizeCompetitionRegistration(validRegistration({ personal_data_accepted: false })),
    /обработку персональных данных/
  );
});

test('competition registration requires two different valid phones', () => {
  assert.throws(
    () => normalizeCompetitionRegistration(validRegistration({ female_phone: '+7 999 111-22-33' })),
    /разные номера телефонов/
  );
  assert.throws(
    () => normalizeCompetitionRegistration(validRegistration({ male_phone: '123' })),
    /корректный телефон/
  );
});

test('an identical repeated registration can resume payment', () => {
  const submitted = normalizeCompetitionRegistration(validRegistration());
  assert.equal(registrationsMatch({ ...submitted }, submitted), true);
  assert.equal(registrationsMatch({ ...submitted, team_name: 'Другая команда' }, submitted), false);
  assert.equal(registrationsMatch({ ...submitted, category: 'advanced' }, submitted), false);
});
