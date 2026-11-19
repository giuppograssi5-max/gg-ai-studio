import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMeetup, cleanProfile, meetupTransition, pairOf, previewOf, moderationPrompt, isRoom } from '../community-core.js';

const now = new Date('2026-11-16T12:00:00Z');

test('meetups need a place and a time in the next six months', () => {
  const m = cleanMeetup({ place: '  Bar Basso ', city: 'Milano', when: '2026-11-20T19:00:00Z', note: 'Aperitivo?' }, now);
  assert.deepEqual(m, { place: 'Bar Basso', city: 'Milano', when: '2026-11-20T19:00:00.000Z', note: 'Aperitivo?', status: 'proposed' });
  assert.throws(() => cleanMeetup({ place: 'x', when: '2026-11-20T19:00:00Z' }, now), /name of the place/);
  assert.throws(() => cleanMeetup({ place: 'Bar', when: 'soon' }, now), /date and time/);
  assert.throws(() => cleanMeetup({ place: 'Bar', when: '2026-11-01T19:00:00Z' }, now), /future/);
  assert.throws(() => cleanMeetup({ place: 'Bar', when: '2027-09-01T19:00:00Z' }, now), /6 months/);
});

test('only the invited member answers and only the proposer cancels', () => {
  const proposed = { status: 'proposed' }, accepted = { status: 'accepted' };
  assert.equal(meetupTransition(proposed, 'accepted', false), 'accepted');
  assert.equal(meetupTransition(proposed, 'accepted', true), null);
  assert.equal(meetupTransition(proposed, 'cancelled', false), null);
  assert.equal(meetupTransition(accepted, 'cancelled', true), 'cancelled');
  assert.equal(meetupTransition(accepted, 'declined', false), 'declined');
  assert.equal(meetupTransition({ status: 'cancelled' }, 'accepted', false), null);
  assert.equal(meetupTransition(proposed, 'proposed', false), null);
  assert.equal(meetupTransition(proposed, 'whatever', false), null);
});

test('profiles, pairs and previews', () => {
  assert.deepEqual(cleanProfile({ city: ' Roma ', bio: 'Sushi  lover', allowDms: false }), { city: 'Roma', bio: 'Sushi lover', allowDms: false });
  assert.equal(cleanProfile({}).allowDms, true);
  assert.throws(() => cleanProfile({ bio: 'x'.repeat(161) }), /160/);
  assert.deepEqual(pairOf('b', 'a'), ['a', 'b']);
  assert.equal(previewOf('meetup', '', { place: 'Bar Basso' }), '📍 Meetup: Bar Basso');
  assert.ok(isRoom('places'));
});

test('moderation knows about private messages and venue tips', () => {
  const p = moderationPrompt('Try Da Enzo in Trastevere!', 'private');
  assert.match(p.messages[0].content, /Private message between two members/);
  assert.match(p.system, /recommendations of restaurants, bars/);
});
