// Tests for stormgridState.js
//
// Run with:  node --test src/modules/stormgrid/stormgridState.test.js
//
// Pure-Node unit tests for the Stormgrid state container. No DOM, no
// Leaflet, no fetch. Asserts the four state pieces (isActive,
// selectedCatchmentId, catchmentFeatures, isLoaded) plus subscription
// semantics.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as state from './stormgridState.js';

// =========================================================================
// Defaults
// =========================================================================

test('default state: not active, not loaded, nothing selected', () => {
  state._resetForTests();
  const s = state.getState();
  assert.equal(s.isActive,            false);
  assert.equal(s.isLoaded,            false);
  assert.equal(s.isLoading,           false);
  assert.equal(s.selectedCatchmentId, null);
  assert.equal(s.catchmentFeatures,   null);
});

// =========================================================================
// setActive
// =========================================================================

test('setActive: toggles isActive and notifies on change only', () => {
  state._resetForTests();
  let calls = 0;
  state.subscribe(() => { calls += 1; });

  state.setActive(true);
  assert.equal(state.isActive(), true);
  assert.equal(calls, 1);

  state.setActive(true);
  assert.equal(calls, 1, 'no-op set must not fire subscribers');

  state.setActive(false);
  assert.equal(state.isActive(), false);
  assert.equal(calls, 2);
});

test('setActive: coerces truthy/falsy inputs to booleans', () => {
  state._resetForTests();
  state.setActive(1);
  assert.equal(state.isActive(), true);
  state.setActive(0);
  assert.equal(state.isActive(), false);
});

// =========================================================================
// setLoading
// =========================================================================

test('setLoading: tracks transient loading flag', () => {
  state._resetForTests();
  state.setLoading(true);
  assert.equal(state.isLoading(), true);
  state.setLoading(false);
  assert.equal(state.isLoading(), false);
});

// =========================================================================
// setFeatures
// =========================================================================

test('setFeatures: marks isLoaded true and clears isLoading', () => {
  state._resetForTests();
  state.setLoading(true);
  state.setFeatures([{ properties: { catchment_id: 'catch_1' } }]);
  assert.equal(state.isLoaded(),               true);
  assert.equal(state.getState().isLoading,     false);
  assert.equal(state.getCatchmentFeatures().length, 1);
});

test('setFeatures: non-array clears the cache and isLoaded', () => {
  state._resetForTests();
  state.setFeatures([{ properties: { catchment_id: 'catch_1' } }]);
  state.setFeatures(null);
  assert.equal(state.isLoaded(),                  false);
  assert.equal(state.getCatchmentFeatures(),      null);
});

// =========================================================================
// setSelectedCatchmentId
// =========================================================================

test('setSelectedCatchmentId: stringifies non-null inputs', () => {
  state._resetForTests();
  state.setSelectedCatchmentId(47);
  assert.equal(state.getSelectedCatchmentId(), '47',
    'numeric ids must be coerced to strings for stable comparison');
});

test('setSelectedCatchmentId: no-op on equal value', () => {
  state._resetForTests();
  let calls = 0;
  state.subscribe(() => { calls += 1; });
  state.setSelectedCatchmentId('catch_47');
  state.setSelectedCatchmentId('catch_47');
  assert.equal(calls, 1, 'identical id must not re-fire subscribers');
});

test('setSelectedCatchmentId: null clears selection', () => {
  state._resetForTests();
  state.setSelectedCatchmentId('catch_47');
  state.setSelectedCatchmentId(null);
  assert.equal(state.getSelectedCatchmentId(), null);
});

test('clearSelection: equivalent to setSelectedCatchmentId(null)', () => {
  state._resetForTests();
  state.setSelectedCatchmentId('catch_47');
  state.clearSelection();
  assert.equal(state.getSelectedCatchmentId(), null);
});

// =========================================================================
// getSelectedFeature
// =========================================================================

test('getSelectedFeature: returns the matching feature when both id and features are set', () => {
  state._resetForTests();
  state.setFeatures([
    { properties: { catchment_id: 'a' } },
    { properties: { catchment_id: 'b' } }
  ]);
  state.setSelectedCatchmentId('b');
  const f = state.getSelectedFeature();
  assert.ok(f);
  assert.equal(f.properties.catchment_id, 'b');
});

test('getSelectedFeature: returns null when no selection or no features', () => {
  state._resetForTests();
  assert.equal(state.getSelectedFeature(), null);
  state.setFeatures([{ properties: { catchment_id: 'a' } }]);
  assert.equal(state.getSelectedFeature(), null,
    'features set but nothing selected -> null');
  state._resetForTests();
  state.setSelectedCatchmentId('a');
  assert.equal(state.getSelectedFeature(), null,
    'id set but no features loaded -> null');
});

// =========================================================================
// subscribe
// =========================================================================

test('subscribe: returns an unsubscribe function', () => {
  state._resetForTests();
  let calls = 0;
  const unsub = state.subscribe(() => { calls += 1; });
  state.setActive(true);
  unsub();
  state.setActive(false);
  assert.equal(calls, 1, 'unsubscribed listener must not fire after unsub()');
});

test('subscribe: throws on non-function input', () => {
  assert.throws(() => state.subscribe(123), TypeError);
  assert.throws(() => state.subscribe(null), TypeError);
});

test('subscribe: a throwing listener does not stop other listeners or break the dispatcher', () => {
  state._resetForTests();
  const calls = [];
  state.subscribe(() => { throw new Error('boom'); });
  state.subscribe(() => { calls.push('b'); });
  state.setActive(true);
  assert.deepEqual(calls, ['b'],
    'throwing listener must not block subsequent listeners');
});
