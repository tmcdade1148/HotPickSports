import {buildInviteMessage} from '@shared/utils/invite';

const nflPool = {
  competition: 'nfl_2026',
  name: 'AUGUST COMPANY',
  name_display: null,
};

describe('buildInviteMessage', () => {
  it('renders the code-first NFL invite exactly', () => {
    expect(buildInviteMessage(nflPool, 'AUGUST')).toBe(
      'Hey — come play in my HotPick NFL pool "AUGUST COMPANY".\n' +
        "Pick games 🏈, talk smack, settle who's got bragging rights.\n\n" +
        'Your invite code:\nAUGUST\n\n' +
        'Already have HotPick? Open it and enter that code.\n' +
        'New here? Grab the app 👉 https://hotpick.app/join/AUGUST',
    );
  });

  it('uses each sport’s own label and emoji — never football', () => {
    const nhl = buildInviteMessage(
      {competition: 'nhl_playoffs_2027', name: 'THE RINK'},
      'PUCK',
    );
    expect(nhl).toContain('my HotPick NHL Playoffs pool "THE RINK"');
    expect(nhl).toContain('Pick games 🏒,');
    expect(nhl).not.toContain('🏈');
    expect(nhl).not.toContain('football');

    const wc = buildInviteMessage(
      {competition: 'world_cup_2026', name: 'THE GROUP'},
      'GOAL',
    );
    expect(wc).toContain('my HotPick World Cup pool "THE GROUP"');
    expect(wc).toContain('Pick games ⚽,');
  });

  it('inherits the NFL label on the preseason competition', () => {
    expect(
      buildInviteMessage({competition: 'nfl_2026_pre', name: 'WARMUP'}, 'PRE1'),
    ).toContain('my HotPick NFL pool "WARMUP"');
  });

  it('drops the label cleanly for an unregistered competition', () => {
    const msg = buildInviteMessage(
      {competition: 'not_a_real_competition', name: 'MYSTERY'},
      'CODE',
    );
    expect(msg).toContain('my HotPick pool "MYSTERY".');
    expect(msg).toContain("Pick games, talk smack, settle who's got");
    expect(msg).not.toMatch(/undefined|null/);
    expect(msg).not.toMatch(/ {2}/); // no gap where label/emoji would have been
  });

  it('prefers name_display over name', () => {
    expect(
      buildInviteMessage({...nflPool, name_display: 'The August Company'}, 'AUGUST'),
    ).toContain('pool "The August Company".');
  });

  it('keeps the code on its own line and the link last', () => {
    const lines = buildInviteMessage(nflPool, 'AUGUST').split('\n');
    expect(lines).toContain('AUGUST');
    expect(lines[lines.length - 1]).toBe(
      'New here? Grab the app 👉 https://hotpick.app/join/AUGUST',
    );
  });
});
