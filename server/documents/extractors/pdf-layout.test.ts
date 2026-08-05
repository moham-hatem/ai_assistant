import assert from 'node:assert/strict';
import test from 'node:test';
import { extractLayoutAwarePage } from './pdf-layout.ts';

interface ItemInput {
  height?: number;
  str: string;
  width?: number;
  x: number;
  y: number;
}

function item({ height = 10, str, width = str.length * 5, x, y }: ItemInput) {
  return { height, str, transform: [height, 0, 0, height, x, y], width };
}

test('layout-aware PDF extraction restores a visual numbered sequence', () => {
  const labels = [
    ['Intention in the heart', 140, 110],
    ['Wash both hands', 320, 110],
    ['Rinse the mouth', 485, 110],
    ['Clean the nose', 675, 309],
    ['Wash the face', 810, 306],
    ['Wash both arms to', 937, 313],
    ['Wipe the head', 644, 111],
    ['Wipe the ears', 794, 111],
    ['Wash both feet to', 965, 119],
  ] as const;
  const numberPositions = [
    [1, 135, 245], [2, 288, 245], [3, 442, 245],
    [4, 629, 439], [5, 780, 439], [6, 932, 439],
    [7, 629, 245], [8, 787, 245], [9, 932, 245],
  ] as const;
  const items = [
    item({ str: 'Learn how to perform ablution', x: 220, y: 444, width: 230 }),
    ...labels.map(([str, x, y]) => item({ str, x, y, width: 105 })),
    item({ str: 'the elbows', x: 972, y: 293, width: 60 }),
    item({ str: 'the ankles', x: 995, y: 99, width: 55 }),
    ...numberPositions.map(([str, x, y]) => item({ str: String(str), x, y, width: 8 })),
    item({ str: '7', x: 510, y: 20, width: 8 }),
  ];

  const text = extractLayoutAwarePage(items, { height: 600, pageNumber: 9, width: 1_110 });
  const sequence = text.slice(text.indexOf('Numbered sequence:'), text.indexOf('\n\n', text.indexOf('Numbered sequence:')));

  assert.match(sequence, /1\. Intention in the heart/);
  assert.match(sequence, /6\. Wash both arms to the elbows/);
  assert.match(sequence, /9\. Wash both feet to the ankles/);
  assert.ok(sequence.indexOf('1.') < sequence.indexOf('4.'));
  assert.ok(sequence.indexOf('4.') < sequence.indexOf('9.'));
  assert.equal(text.match(/Intention in the heart/g)?.length, 1);
});

test('normal portrait pages retain top-to-bottom reading order', () => {
  const text = extractLayoutAwarePage([
    item({ str: 'Second line', x: 40, y: 500 }),
    item({ str: 'First line', x: 40, y: 540 }),
  ], { height: 800, pageNumber: 2, width: 600 });

  assert.ok(text.indexOf('First line') < text.indexOf('Second line'));
});
