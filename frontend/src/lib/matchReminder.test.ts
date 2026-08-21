/**
 * The user describes a reminder; the model repeats that description; the
 * reminder itself is worded differently. Two earlier attempts failed here:
 * a whole-string `includes` never matched a phrase against a short text, and
 * a fixed 4-character stem split "воду" from "воды" at exactly the character
 * that inflects.
 */
import { describe, expect, it } from 'vitest';

import { matchReminderByText } from './api';

const reminder = (id: string, text: string) => ({ id, text });

describe('matchReminderByText', () => {
  const reminders = [
    reminder('a', 'выпить воды'),
    reminder('b', 'позвонить маме'),
    reminder('c', 'встреча с командой'),
  ];

  it('matches across Russian inflection', () => {
    // "воду" vs "воды" — same word, different ending.
    expect(matchReminderByText(reminders, 'отмени напоминание про воду')?.id).toBe('a');
  });

  it('ignores the words of the request that are not the subject', () => {
    expect(matchReminderByText(reminders, 'убери напоминание позвонить')?.id).toBe('b');
  });

  it('prefers the reminder sharing more words', () => {
    expect(matchReminderByText(reminders, 'встреча командой')?.id).toBe('c');
  });

  it('returns nothing when no reminder is related', () => {
    expect(matchReminderByText(reminders, 'отмени напоминание про собаку')).toBeUndefined();
  });

  it('returns nothing for a query with no usable words', () => {
    expect(matchReminderByText(reminders, 'а ну')).toBeUndefined();
  });

  it('handles an empty list', () => {
    expect(matchReminderByText([], 'что угодно')).toBeUndefined();
  });

  it('is case insensitive', () => {
    expect(matchReminderByText(reminders, 'ВЫПИТЬ ВОДЫ')?.id).toBe('a');
  });

  it('does not match on a two-character overlap', () => {
    // "вы" alone must not pull in "выпить".
    expect(matchReminderByText([reminder('a', 'выпить воды')], 'вы')).toBeUndefined();
  });

  it('works for English reminders too', () => {
    const english = [reminder('a', 'drink some water'), reminder('b', 'call mom')];
    expect(matchReminderByText(english, 'cancel the water reminder')?.id).toBe('a');
  });
});
