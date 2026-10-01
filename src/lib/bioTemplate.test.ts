import { describe, expect, it } from 'vitest';

import { detectBioSlots, extractTextBlocks, fillBioTemplate, fillTextBlocks, unfilledBioSlots } from './bioTemplate';

const TEMPLATE = `<style>
  .card { color: {{accent_color}}; }
  a[href] { text-decoration: none; }
</style>
<!-- [HOW TO USE] replace the slots below -->
<div class="card">
  <img src="{{banner_url}}" alt="banner">
  <h1>{{name}}</h1>
  <p class="tag">[[tagline]]</p>
  <p>Age: [AGE]</p>
  <p>[Insert backstory here]</p>
  <footer>{{name}} by me · {{char}} talks to {{user}}</footer>
</div>`;

const byToken = (t: string) => detectBioSlots(TEMPLATE).find((s) => s.token === t);

describe('detectBioSlots', () => {
  it('finds each supported placeholder syntax, in document order', () => {
    expect(detectBioSlots(TEMPLATE).map((s) => s.token)).toEqual([
      '{{accent_color}}',
      '{{banner_url}}',
      '{{name}}',
      '[[tagline]]',
      '[AGE]',
      '[Insert backstory here]',
    ]);
  });

  it('leaves the {{char}} and {{user}} macros alone', () => {
    const names = detectBioSlots(TEMPLATE).map((s) => s.name);
    expect(names).not.toContain('char');
    expect(names).not.toContain('user');
  });

  it('does not mistake CSS attribute selectors or comments for slots', () => {
    const tokens = detectBioSlots(TEMPLATE).map((s) => s.token);
    expect(tokens).not.toContain('[href]');
    expect(tokens).not.toContain('[HOW TO USE]');
  });

  it('merges repeats of the same slot and counts them', () => {
    expect(byToken('{{name}}')!.occurrences).toBe(2);
  });

  it('marks URLs, colours and slots inside markup as user-filled assets', () => {
    expect(byToken('{{banner_url}}')!.kind).toBe('asset');
    expect(byToken('{{accent_color}}')!.kind).toBe('asset');
    expect(byToken('{{name}}')!.kind).toBe('text');
  });

  it('gives each slot a readable label and surrounding text', () => {
    const slot = byToken('[Insert backstory here]')!;
    expect(slot.label).toBe('Backstory here');
    expect(byToken('[AGE]')!.context).toContain('Age:');
    expect(byToken('{{banner_url}}')!.label).toBe('Banner URL');
  });

  it('ignores bracketed prose that does not read like a slot', () => {
    const tokens = detectBioSlots('<p>She said [quietly, to herself] that it was fine.</p>').map((s) => s.token);
    expect(tokens).toEqual([]);
  });
});

describe('fillBioTemplate', () => {
  it('replaces every occurrence of a slot', () => {
    const out = fillBioTemplate(TEMPLATE, { '{{name}}': 'Zane Carter' });
    expect(out.match(/Zane Carter/g)).toHaveLength(2);
    expect(out).not.toContain('{{name}}');
  });

  it('inserts values as text, so markup in a value cannot break the layout', () => {
    const out = fillBioTemplate('<p>{{quote}}</p>', { '{{quote}}': '<b>"Run."</b>' });
    expect(out).toBe('<p>&lt;b&gt;&quot;Run.&quot;&lt;/b&gt;</p>');
  });

  it('keeps quotes inside attributes from closing them early', () => {
    const out = fillBioTemplate('<img src="{{banner_url}}">', { '{{banner_url}}': 'x" onerror="alert(1)' });
    expect(out).toBe('<img src="x&quot; onerror=&quot;alert(1)">');
  });

  it('turns line breaks into <br> in text but not inside tags or CSS', () => {
    expect(fillBioTemplate('<p>{{bio}}</p>', { '{{bio}}': 'one\ntwo' })).toBe('<p>one<br>two</p>');
    expect(fillBioTemplate('<a title="{{t}}">', { '{{t}}': 'one\ntwo' })).toBe('<a title="one two">');
  });

  it('leaves empty and disabled slots visible as placeholders', () => {
    const out = fillBioTemplate('{{a}} {{b}} {{c}}', { '{{a}}': 'A', '{{b}}': '', '{{c}}': 'C' }, new Set(['{{a}}', '{{b}}']));
    expect(out).toBe('A {{b}} {{c}}');
  });

  it('does not clip a longer slot that starts with a shorter one', () => {
    const out = fillBioTemplate('{{name}} / {{name_full}}', { '{{name}}': 'Zane', '{{name_full}}': 'Zane Carter' });
    expect(out).toBe('Zane / Zane Carter');
  });
});

describe('unfilledBioSlots', () => {
  it('reports explicit placeholders left in a finished bio', () => {
    expect(unfilledBioSlots('<h1>Zane</h1><p>{{tagline}}</p><p>[AGE]</p>').map((s) => s.token)).toEqual([
      '{{tagline}}',
      '[AGE]',
    ]);
  });

  it('does not nag about Title Case brackets that are probably real content', () => {
    expect(unfilledBioSlots('<p>[Content Warning] Gore.</p>')).toEqual([]);
  });
});

// Shaped like a real shared JanitorAI template: no markers, filler text,
// JanitorAI's own class names, invisible spacer dots, drop-cap headings.
const SAMPLE_TEMPLATE =
  '<p class="_metaCaption_4cue2_1238" style="text-align: center;">One-liner goes here. <br><br>Oops! It\'s a two-liner now.</p>' +
  '<p style="text-align: center;"><span style="color: rgba(255, 255, 255, 0);">.</span></p>' +
  '<p class="_pageTitle_4cue2_65"><span style="color: rgb(255, 54, 54);">¹ </span><span>T</span><span>HE RECAP. </span><span>✦</span></p>' +
  '<p class="_row_4cue2_549"><span><strong>#</strong></span><span><strong>Lorem ipsum </strong>es un texto de relleno estándar.</span></p>' +
  '<p class="_linksRow_45b6m_258"><a href=","><span>Sample </span></a><a href="."><span>Sample</span></a></p>' +
  '<p class="_row_4cue2_549"><a class="_rowIdentity_4cue2_874" href="."><span><strong>Main Character Name</strong></span>' +
  '<span><strong>Age・Pronouns・Quirk</strong></span><span>Location, character &amp; your role.</span></a></p>' +
  '<p><a href="https://janitorai.com/profiles/x"><span><strong>@tigerdropped</strong><br>Free template made by Tiger!</span></a></p>' +
  '<p><a href=",">Short link 1</a></p>';

const blockTexts = () => extractTextBlocks(SAMPLE_TEMPLATE).map((b) => b.text);
const block = (text: string) => extractTextBlocks(SAMPLE_TEMPLATE).find((b) => b.text === text)!;

describe('extractTextBlocks', () => {
  it('finds no marker slots in a sample-text template, which is why this mode exists', () => {
    expect(detectBioSlots(SAMPLE_TEMPLATE)).toEqual([]);
  });

  it('skips spacer dots, glyphs, emoji-free punctuation and single drop-cap letters', () => {
    const texts = blockTexts();
    expect(texts).not.toContain('.');
    expect(texts).not.toContain('✦');
    expect(texts).not.toContain('#');
    expect(texts).not.toContain('T');
    expect(texts).toContain('HE RECAP.');
  });

  it('decodes entities for display', () => {
    expect(blockTexts()).toContain('Location, character & your role.');
  });

  it('pre-ticks filler, and leaves headings, credits and link labels alone', () => {
    for (const t of ['One-liner goes here.', 'Lorem ipsum', 'Sample', 'Main Character Name', 'Age・Pronouns・Quirk']) {
      expect(block(t).likelySample).toBe(true);
    }
    for (const t of ['HE RECAP.', '@tigerdropped', 'Free template made by Tiger!', 'Short link 1']) {
      expect(block(t).likelySample).toBe(false);
    }
  });

  it('groups runs by paragraph, so a bold lead-in and its sentence travel together', () => {
    expect(block('Lorem ipsum').paragraph).toBe(block('es un texto de relleno estándar.').paragraph);
    expect(block('Lorem ipsum').paragraph).not.toBe(block('Main Character Name').paragraph);
  });

  it('shows each block in readable context, joining drop-caps back into words', () => {
    expect(block('Lorem ipsum').context).toContain('THE RECAP.');
    expect(block('Lorem ipsum').context).toContain('___ es un texto');
  });

  it('keeps separate fields in one paragraph apart in the context', () => {
    expect(block('Age・Pronouns・Quirk').context).toContain('Main Character Name · ___ · Location');
  });
});

describe('fillTextBlocks', () => {
  const blocks = extractTextBlocks(SAMPLE_TEMPLATE);
  const id = (t: string) => blocks.find((b) => b.text === t)!.id;

  it('replaces only the chosen runs and leaves every other byte alone', () => {
    const out = fillTextBlocks(SAMPLE_TEMPLATE, blocks, { [id('Main Character Name')]: 'Zane Carter' });
    expect(out).toBe(SAMPLE_TEMPLATE.replace('Main Character Name', 'Zane Carter'));
  });

  it('keeps the whitespace around a run, so adjacent pills stay apart', () => {
    const pills = blocks.filter((b) => b.text === 'Sample');
    const out = fillTextBlocks(SAMPLE_TEMPLATE, blocks, { [pills[0].id]: 'Slow Burn', [pills[1].id]: 'Angst' });
    expect(out).toContain('<span>Slow Burn </span></a><a href="."><span>Angst</span>');
  });

  it('escapes values and keeps entities intact elsewhere', () => {
    const out = fillTextBlocks(SAMPLE_TEMPLATE, blocks, { [id('Lorem ipsum')]: 'Rules <b>& more' });
    expect(out).toContain('<strong>Rules &lt;b&gt;&amp; more </strong>');
    expect(out).toContain('character &amp; your role.');
  });

  it('respects unticked blocks and empty values', () => {
    const out = fillTextBlocks(
      SAMPLE_TEMPLATE,
      blocks,
      { [id('Sample')]: 'X', [id('Main Character Name')]: '' },
      new Set([id('Main Character Name')])
    );
    expect(out).toBe(SAMPLE_TEMPLATE);
  });
});
