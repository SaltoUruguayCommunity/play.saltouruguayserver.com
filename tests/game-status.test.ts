import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditGameMetadata } from '../src/lib/game-status';

test('developers can edit metadata for active games, but not suspended ones', () => {
    assert.equal(canEditGameMetadata('draft'), true);
    assert.equal(canEditGameMetadata('review'), true);
    assert.equal(canEditGameMetadata('published'), true);
    assert.equal(canEditGameMetadata('suspended'), false);
});
