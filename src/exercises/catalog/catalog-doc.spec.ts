import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface CatalogFile {
  muscleGroups: { code: string }[];
  exercises: {
    name: string;
    aliases?: string[];
    primaryMuscles: string[];
    secondaryMuscles?: string[];
  }[];
}

const root = join(__dirname, '..', '..', '..');
const catalog = JSON.parse(
  readFileSync(join(root, 'prisma/seed/exercise-catalog.json'), 'utf8'),
) as CatalogFile;
const doc = readFileSync(join(root, 'docs/CATALOG.md'), 'utf8');

describe('docs/CATALOG.md', () => {
  it('has exactly one row per exercise, with its aliases and muscles as in the JSON', () => {
    const dash = (items: string[] | undefined) => (items?.length ? items.join(', ') : '–');
    const expected = catalog.exercises.map(
      (e) =>
        `| ${e.name} | ${dash(e.aliases)} | ${e.primaryMuscles.join(', ')} | ${dash(e.secondaryMuscles)} |`,
    );
    const rows = doc
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Exercise'));
    expect(rows).toEqual(expected);
  });

  it('lists every muscle-group code', () => {
    for (const group of catalog.muscleGroups) expect(doc).toContain(`\`${group.code}\``);
  });
});
